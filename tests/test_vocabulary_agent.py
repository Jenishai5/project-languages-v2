import json
import threading
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_reply_cache, get_session, get_token_verifier, get_vocabulary_agent
from langapp.api.main import app
from langapp.domain import ChatReply, ItemType, ParsedConcept, PlannedLesson
from langapp.errors import NotFound, RateLimited
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.progress import ProgressRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.base import LearnerContext
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from langapp.services.agents.vocabulary import VocabularyAgent, build_messages, parse_word_help
from langapp.services.learner import LearnerService
from tests.test_lessons import USER, FakeVerifier

AUTH = {"Authorization": "Bearer good-token"}
HELP = {
    "examples": [
        {"sentence": "The doctor is kind.", "translation": "El médico es amable."},
        {"sentence": "I call the doctor.", "translation": "Llamo al médico."},
    ],
    "synonyms": ["physician", "physician", "medic"],
    "antonyms": [],
    "tip": "Doctor suena casi igual que doctor en español.",
}


class FakeChat:
    def __init__(self, text: str | None = None) -> None:
        self.text = text if text is not None else json.dumps(HELP, ensure_ascii=False)
        self.calls: list[list[dict]] = []

    def chat_json(self, models, messages, user=None, max_tokens=400):
        self.calls.append(messages)
        return ChatReply(text=self.text, model="tiny:free", tokens=30)


def seed_words(session_factory) -> dict[str, int]:
    concepts = [
        ParsedConcept(slug="doctor", category="people", terms={"eng": "doctor", "spa": "el médico"}, emoji="🩺"),
        ParsedConcept(slug="paper", category="objects", terms={"eng": "paper", "spa": "el papel"}),
        ParsedConcept(slug="cat", category="animals", terms={"eng": "cat", "spa": "el gato"}),
    ]
    with session_factory.begin() as session:
        ids = ConceptRepository(session).upsert_concepts(concepts)
        LessonRepository(session).upsert_lessons(
            [PlannedLesson(slug="work-1", title="Work 1", position=1, concept_slugs=("doctor", "paper"))], ids
        )
        return ids


def record(session_factory, slug: str, results: list[bool]) -> None:
    with session_factory.begin() as session:
        repo = ProgressRepository(session)
        for correct in results:
            repo.record(USER.id, ItemType.WORD, f"eng:{slug}", correct)


def make_orchestrator(session, chat, cache=None, limit=5) -> AgentOrchestrator:
    return AgentOrchestrator(
        SentenceRepository(session),
        ConceptRepository(session),
        UserSettingsRepository(session),
        LearningOutcomeRepository(session),
        AiUsageRepository(session),
        grammar=None,
        vocabulary=VocabularyAgent(chat, ("tiny:free",)) if chat else None,
        cache=cache or ReplyCache(),
        gate=threading.BoundedSemaphore(2),
        limits=AgentLimits(daily_limit=limit, wait_seconds=0.01),
        clock=lambda: datetime.now(UTC),
    )


def test_prompt_asks_for_easy_examples_in_both_languages():
    context = LearnerContext(user_id=USER.id, learning="eng", native="spa", level="A2")
    system, student = build_messages(context, "doctor", "el médico")

    assert "English vocabulary teacher" in system["content"]
    assert "level A2" in system["content"] and "Spanish translation" in system["content"]
    assert json.loads(student["content"]) == {"word": "doctor", "meaning": "el médico"}


def test_parse_word_help_removes_duplicates_and_limits_lists():
    help_ = parse_word_help(json.dumps({**HELP, "antonyms": ["a", "b", "c", "d"]}))

    assert help_.synonyms == ("physician", "medic")
    assert help_.antonyms == ("a", "b", "c")
    assert len(help_.examples) == 2 and help_.useful


def test_parse_word_help_keeps_plain_text_as_a_tip():
    help_ = parse_word_help("Think of a doctor's white coat.")
    assert help_.tip == "Think of a doctor's white coat." and help_.examples == ()


def test_weak_words_rank_the_hardest_first_and_respect_the_lesson(session_factory):
    ids = seed_words(session_factory)
    record(session_factory, "doctor", [False, False, True])
    record(session_factory, "paper", [False, True, True])
    record(session_factory, "cat", [False])
    with session_factory.begin() as session:
        ProgressRepository(session).record(USER.id, ItemType.WORD, "eng:never-wrong", True)

    with session_factory() as session:
        service = LearnerService(ProgressRepository(session), ConceptRepository(session), LessonRepository(session))
        everything = service.weak_words(USER.id, "eng", "spa")
        lesson_id = LessonRepository(session).list_lessons("eng", "spa")[0]["id"]
        in_lesson = service.weak_words(USER.id, "eng", "spa", lesson_id=lesson_id)

    assert [w["slug"] for w in everything] == ["cat", "doctor", "paper"]
    assert [w["slug"] for w in in_lesson] == ["doctor", "paper"]
    assert in_lesson[0] == {
        "concept_id": ids["doctor"], "slug": "doctor", "word": "doctor", "translation": "el médico",
        "emoji": "🩺", "attempts": 3, "correct": 1,
    }


def test_word_help_is_shared_through_the_cache_and_saved(session_factory):
    ids = seed_words(session_factory)
    chat, cache = FakeChat(), ReplyCache()
    with session_factory.begin() as session:
        first = make_orchestrator(session, chat, cache).word_help(USER.id, ids["doctor"], "eng", "spa")
    with session_factory.begin() as session:
        second = make_orchestrator(session, chat, cache).word_help(USER.id, ids["doctor"], "eng", "spa")

    assert first["available"] and first["examples"][0]["sentence"] == "The doctor is kind."
    assert first["word"] == "doctor" and first["remaining_today"] == 4
    assert second["cached"] is True and len(chat.calls) == 1
    with session_factory() as session:
        outcomes = LearningOutcomeRepository(session).recent_for_user(USER.id)
        assert [(o.kind, o.concept_id) for o in outcomes] == [("word_help", ids["doctor"])] * 2


def test_word_help_for_unknown_word_is_404(session_factory):
    seed_words(session_factory)
    with session_factory.begin() as session, pytest.raises(NotFound):
        make_orchestrator(session, FakeChat()).word_help(USER.id, 9999, "eng", "spa")


def test_word_help_shares_the_daily_limit(session_factory):
    ids = seed_words(session_factory)
    with session_factory.begin() as session:
        AiUsageRepository(session).log(USER.id, "grammar", "tiny:free", True)
    with session_factory.begin() as session, pytest.raises(RateLimited):
        make_orchestrator(session, FakeChat(), limit=1).word_help(USER.id, ids["cat"], "eng", "spa")


def test_word_help_without_ai_says_so(session_factory):
    ids = seed_words(session_factory)
    with session_factory.begin() as session:
        result = make_orchestrator(session, None).word_help(USER.id, ids["cat"], "eng", "spa")
    assert result["available"] is False and "not set up" in result["message"]


@pytest.fixture
def api(session_factory):
    chat = FakeChat()

    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_vocabulary_agent] = lambda: VocabularyAgent(chat, ("tiny:free",))
    app.dependency_overrides[get_reply_cache] = lambda: ReplyCache()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_endpoints_return_weak_words_and_help(api, session_factory):
    ids = seed_words(session_factory)
    record(session_factory, "paper", [False])

    weak = api.get("/agents/vocabulary/weak", params={"learning": "eng", "native": "spa"}, headers=AUTH)
    helped = api.post(
        "/agents/vocabulary/help", json={"concept_id": ids["paper"], "learning": "eng", "native": "spa"}, headers=AUTH
    )

    assert weak.status_code == 200 and weak.json()["words"][0]["word"] == "paper"
    assert helped.status_code == 200 and helped.json()["synonyms"] == ["physician", "medic"]


def test_lesson_word_results_feed_the_weak_list(api, session_factory):
    ids = seed_words(session_factory)
    for correct in (False, True):
        saved = api.post(
            "/progress/lesson-word", json={"concept_id": ids["paper"], "learning": "eng", "correct": correct}, headers=AUTH
        )
        assert saved.status_code == 200

    weak = api.get("/agents/vocabulary/weak", params={"learning": "eng", "native": "spa"}, headers=AUTH).json()["words"]
    unknown = api.post("/progress/lesson-word", json={"concept_id": 999, "learning": "eng", "correct": True}, headers=AUTH)

    assert [(w["slug"], w["correct"], w["attempts"]) for w in weak] == [("paper", 1, 2)]
    assert unknown.status_code == 404


def test_endpoints_need_login(api):
    assert api.get("/agents/vocabulary/weak", params={"learning": "eng", "native": "spa"}).status_code == 401
