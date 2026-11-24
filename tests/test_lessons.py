import random
import uuid
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from langapp.api.deps import get_session, get_token_verifier
from langapp.api.main import app
from langapp.auth import AuthError, AuthUser
from langapp.ingestion.concepts import ParsedConcept, PlannedLesson, build_concepts, core_word, normalize_category, plan_lessons
from langapp.ingestion.dictionary_parser import load_dictionary_file, pair_from_file_name
from langapp.ingestion.parser import parse_page
from langapp.ingestion.tatoeba_client import TatoebaClient
from langapp.repositories.lessons import LessonRepository
from langapp.services.lessons import pick_sentences, picture_rounds
from langapp.services.lesson_builder import (
    LessonSentenceBuilder,
    coverage,
    import_concepts,
    known_vocabulary,
    rank_candidates,
    search_query,
)
from tests.conftest import load_fixture

DICTIONARIES = Path(__file__).resolve().parent.parent / "data" / "dictionaries"
BASE = "https://api.tatoeba.org"
USER = AuthUser(id=uuid.UUID("8c5b4a3e-2f1d-4c6b-9a8e-7d6c5b4a3e2f"), email="jeni@example.com")


def real_concepts():
    files = {pair_from_file_name(p): load_dictionary_file(p)[0] for p in sorted(DICTIONARIES.glob("dictionary-*.json"))}
    return build_concepts(files)


def test_core_word_and_categories():
    assert core_word("el médico / la médica", "spa") == "médico"
    assert core_word("The doctor", "eng") == "doctor"
    assert core_word("врач", "rus") == "врач"
    assert normalize_category("constAnimals") == "animals"
    assert normalize_category("familyAndRelationships") == "family_and_relationships"


def test_concepts_from_real_dictionaries():
    concepts = {c.slug: c for c in real_concepts()}

    assert len(concepts) == 353
    assert concepts["man"].terms == {"eng": "man", "spa": "el hombre", "rus": "мужчина"}
    assert concepts["man"].emoji == "👨"
    assert concepts["fish"].terms["spa"] == "el pescado"
    assert concepts["fish-animals"].terms["spa"] == "pez"
    assert concepts["doctor"].category == "people"


def test_lessons_are_ten_words_per_category():
    lessons = plan_lessons(real_concepts())

    assert lessons[0].title == "People 1"
    assert lessons[0].concept_slugs[:5] == ("man", "woman", "boy", "girl", "friend")
    assert len(lessons[0].concept_slugs) == 10
    assert all(5 <= len(lesson.concept_slugs) <= 14 for lesson in lessons)
    assert [lesson.position for lesson in lessons] == list(range(1, len(lessons) + 1))


def test_search_query():
    assert search_query("doctor", "eng") == "=doctor"
    assert search_query("ice cream", "eng") == '"ice cream"'
    assert search_query("el médico / la médica", "spa") == "=médico"


def test_coverage_counts_known_words():
    known = known_vocabulary(["doctor", "car"], "eng")

    assert coverage("I need a doctor.", known) == 1.0
    assert coverage("Consult your physician.", known) == pytest.approx(1 / 3)


def test_ranking_keeps_sentences_with_native_translation_and_prefers_audio():
    sentences = parse_page(load_fixture("tatoeba_search_doctor_paper.json")["doctor"]).sentences
    known = known_vocabulary(["doctor"], "eng")

    spanish = rank_candidates(sentences, "doctor", known, ["spa"], min_coverage=0.6)
    russian = rank_candidates(sentences, "doctor", known, ["rus"], min_coverage=0.6)

    assert {s.text for s in spanish} == {"Consult your doctor.", "Consult a doctor.", "Call a doctor."}
    assert all(any(t.lang == "spa" for t in s.translations) for s in spanish)
    assert len(russian) > len(spanish)
    assert russian[0].audios


def test_ranking_drops_sentences_without_the_exact_word():
    sentences = parse_page(load_fixture("tatoeba_search_doctor_paper.json")["paper"]).sentences

    ranked = rank_candidates(sentences, "doctor", known_vocabulary([], "eng"), ["spa", "rus"], 0.0)

    assert ranked == []


def seed_doctor_paper_lesson(session_factory) -> int:
    concepts = [
        ParsedConcept(slug="doctor", category="people", terms={"eng": "doctor", "spa": "el médico", "rus": "врач"}),
        ParsedConcept(slug="paper", category="objects", terms={"eng": "paper", "spa": "el papel", "rus": "бумага"}, emoji="📄"),
    ]
    with session_factory.begin() as session:
        repo = LessonRepository(session)
        ids = repo.upsert_concepts(concepts)
        repo.upsert_lessons([PlannedLesson(slug="work-1", title="Work 1", position=1, concept_slugs=("doctor", "paper"))], ids)
        return repo.list_lessons("eng", "spa")[0]["id"]


def mock_tatoeba():
    fixture = load_fixture("tatoeba_search_doctor_paper.json")

    def answer(request):
        word = request.url.params["q"].lstrip("=")
        return httpx.Response(200, json=fixture.get(word, {"data": [], "paging": {}}))

    return respx.get(f"{BASE}/v1/sentences").mock(side_effect=answer)


@respx.mock
def test_build_lessons_is_idempotent(session_factory):
    seed_doctor_paper_lesson(session_factory)
    route = mock_tatoeba()

    with TatoebaClient(base_url=BASE, min_interval_seconds=0, sleep=lambda _: None) as client:
        builder = LessonSentenceBuilder(client, session_factory, per_word=2)
        first = builder.build("eng", ["spa", "rus"], first_lessons=1)
        second = builder.build("eng", ["spa", "rus"], first_lessons=1)

    assert route.calls[0].request.url.params["q"] == "=doctor"
    assert route.calls[0].request.url.params["trans:lang"] == "spa,rus"
    assert (first.words, first.words_with_sentences) == (2, 2)
    assert first.sentences_linked >= 4
    assert second.sentences_linked == 0
    assert first.missed == []


def test_import_concepts_twice_gives_same_counts(session_factory):
    paths = sorted(DICTIONARIES.glob("dictionary-*.json"))

    first = import_concepts(paths, session_factory)
    second = import_concepts(paths, session_factory)

    assert first.concepts == second.concepts == 353
    assert first.lessons == second.lessons


class FakeVerifier:
    def verify(self, token: str) -> AuthUser:
        if token != "good-token":
            raise AuthError("invalid or expired token")
        return USER


@pytest.fixture
def api(session_factory):
    def override_session():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def built_lesson(session_factory):
    lesson_id = seed_doctor_paper_lesson(session_factory)
    with respx.mock:
        mock_tatoeba()
        with TatoebaClient(base_url=BASE, min_interval_seconds=0, sleep=lambda _: None) as client:
            LessonSentenceBuilder(client, session_factory, per_word=3).build("eng", ["spa", "rus"], first_lessons=1)
    return lesson_id


def test_languages_and_lesson_list(api, built_lesson):
    languages = api.get("/languages").json()["languages"]
    lessons = api.get("/lessons", params={"learning": "eng", "native": "rus"}).json()["lessons"]

    assert {lang["code"] for lang in languages} == {"eng", "spa", "rus"}
    assert lessons[0]["title"] == "Work 1"
    assert lessons[0]["word_count"] == 2
    assert lessons[0]["sentence_count"] >= 4


def test_lesson_detail_in_the_users_native_language(api, built_lesson):
    lesson = api.get(f"/lessons/{built_lesson}", params={"learning": "eng", "native": "spa"}).json()

    assert [w["word"] for w in lesson["words"]] == ["doctor", "paper"]
    assert lesson["words"][1]["translation"] == "el papel"
    assert lesson["words"][1]["emoji"] == "📄"
    assert lesson["words"][1]["image_url"] is None
    assert lesson["sentences"]
    assert all(s["prompt"] for s in lesson["sentences"])
    consult = next(s for s in lesson["sentences"] if s["full_text"] == "Consult your doctor.")
    assert consult["prompt"] == "Consulta a tu doctor."
    assert [w["form"] for w in consult["words"]] == ["Consult", "your", "doctor"]
    assert len(lesson["sentences"]) <= 5
    assert {s["concept_slug"] for s in lesson["sentences"]} == {"doctor", "paper"}
    assert lesson["pictures"] == [
        {"slug": "paper", "emoji": "📄", "image_url": None, "options": lesson["pictures"][0]["options"], "answer": "paper"}
    ]
    assert sorted(lesson["pictures"][0]["options"]) == ["doctor", "paper"]


def test_lesson_errors(api, built_lesson):
    assert api.get("/lessons/999").status_code == 404
    assert api.get("/lessons", params={"learning": "eng", "native": "eng"}).status_code == 400
    assert api.get("/lessons", params={"learning": "eng", "native": "cat"}).status_code == 400


def test_settings_are_saved_per_user(api, built_lesson):
    headers = {"Authorization": "Bearer good-token"}

    missing = api.get("/settings", headers=headers)
    saved = api.put("/settings", json={"native_lang": "rus", "learning_lang": "eng"}, headers=headers)
    loaded = api.get("/settings", headers=headers)
    same = api.put("/settings", json={"native_lang": "eng", "learning_lang": "eng"}, headers=headers)

    assert missing.status_code == 404
    assert saved.json() == {"native_lang": "rus", "learning_lang": "eng"}
    assert loaded.json() == {"native_lang": "rus", "learning_lang": "eng"}
    assert same.status_code == 400


def test_lesson_progress(api, built_lesson):
    headers = {"Authorization": "Bearer good-token"}

    api.post("/progress/lesson", json={"lesson_id": built_lesson, "correct": True}, headers=headers)
    progress = api.get("/progress/lessons", headers=headers).json()["progress"]

    assert progress[str(built_lesson)]["mastery"] == 1


def test_image_shows_only_after_approval(api, built_lesson, session_factory):
    with session_factory.begin() as session:
        LessonRepository(session).set_image("paper", "https://example.org/paper.png", approved=False)
    hidden = api.get(f"/lessons/{built_lesson}").json()["words"][1]["image_url"]

    with session_factory.begin() as session:
        LessonRepository(session).set_image("paper", "https://example.org/paper.png", approved=True)
    shown = api.get(f"/lessons/{built_lesson}").json()["words"][1]["image_url"]

    assert hidden is None
    assert shown == "https://example.org/paper.png"


def test_pick_sentences_spreads_over_words():
    exercises = [{"concept_slug": slug, "full_text": f"{slug} {n}"} for slug in ("a", "b", "c") for n in range(3)]
    exercises.append({"concept_slug": "c", "full_text": "a 0"})

    picked = pick_sentences(exercises, 5)

    assert [e["full_text"] for e in picked] == ["a 0", "b 0", "c 0", "a 1", "b 1"]


def test_picture_rounds_offer_four_words_and_skip_words_without_pictures():
    words = [
        {"slug": f"w{n}", "word": f"word{n}", "emoji": "🙂" if n % 2 == 0 else None, "image_url": None}
        for n in range(6)
    ]

    rounds = picture_rounds(words, random.Random(1))

    assert [r["answer"] for r in rounds] == ["word0", "word2", "word4"]
    assert all(len(r["options"]) == 4 and r["answer"] in r["options"] for r in rounds)
    assert all(len(set(r["options"])) == 4 for r in rounds)


def test_reimporting_with_a_new_plan_replaces_old_lessons(session_factory):
    concepts = real_concepts()
    with session_factory.begin() as session:
        repo = LessonRepository(session)
        ids = repo.upsert_concepts(concepts)
        repo.upsert_lessons(plan_lessons(concepts, 5), ids)
    with session_factory.begin() as session:
        repo = LessonRepository(session)
        count = repo.upsert_lessons(plan_lessons(concepts, 10), ids)
    with session_factory() as session:
        lessons = LessonRepository(session).list_lessons("eng", "spa")

    assert count == len(lessons)
    assert lessons[0]["word_count"] == 10
    assert [lesson["position"] for lesson in lessons] == list(range(1, len(lessons) + 1))
