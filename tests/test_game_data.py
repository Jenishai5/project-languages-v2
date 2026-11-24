import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

from langapp.db.models import Audio, Sentence, WordPair
from langapp.ingestion.dictionary_parser import load_dictionary_file
from langapp.ingestion.parser import parse_page
from langapp.repositories.progress import ProgressRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.word_pairs import WordPairRepository
from langapp.services.word_import import import_word_files
from tests.conftest import load_fixture

DICTIONARIES = Path(__file__).resolve().parent.parent / "data" / "dictionaries"
USER = uuid.UUID("8c5b4a3e-2f1d-4c6b-9a8e-7d6c5b4a3e2f")


def import_english_fixture(session_factory):
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(parse_page(load_fixture("tatoeba_eng_audio_page.json")).sentences)


def test_parser_reads_audio_with_time_zone():
    result = parse_page(load_fixture("tatoeba_eng_audio_page.json"))

    first = result.sentences[0]
    assert result.issues == []
    assert first.audios[0].author == "rul"
    assert first.audios[0].license == "CC BY 4.0"
    assert first.audios[0].created.utcoffset() == timedelta(0)
    assert first.translations[0].audios[0].license == "CC BY-NC-ND 3.0"


def test_bad_audio_is_skipped_but_sentence_kept():
    payload = load_fixture("tatoeba_eng_audio_page.json")
    payload["data"][0]["audios"].append({"id": 5, "download_url": "not a url"})
    payload["data"][0]["audios"].append({"id": 6, "download_url": "https://x.org/a", "created": "2026-01-01T10:00:00"})

    result = parse_page(payload)

    assert len(result.sentences[0].audios) == 1
    assert sum("audio skipped" in issue.reason for issue in result.issues) == 2


def test_audios_and_word_counts_are_stored_once(session_factory):
    import_english_fixture(session_factory)
    import_english_fixture(session_factory)

    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Audio)) == 6
        assert session.get(Sentence, 14007817).word_count == 6
        assert session.get(Audio, 1285708).recorded_at == datetime(2026, 9, 26, 5, 43, 42, tzinfo=UTC)


def test_builder_finds_english_sentences_with_spanish_translation(session_factory):
    import_english_fixture(session_factory)

    with session_factory() as session:
        repo = SentenceRepository(session)
        sentences = repo.random_for_builder("eng", "spa", max_words=8, limit=10)
        translations = repo.translations_for([s.id for s in sentences], ["spa", "rus"])

    assert sorted(s.id for s in sentences) == [13929437, 13971628, 14007817]
    assert translations[14007817] == {"spa": ["Papá está orgulloso de su coche."], "rus": ["Отец гордится своей машиной."]}


def test_translations_work_in_both_link_directions(session_factory):
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(parse_page(load_fixture("tatoeba_page.json")).sentences)

    with session_factory() as session:
        translations = SentenceRepository(session).translations_for([14132455], ["spa"])

    assert translations[14132455]["spa"] == [
        "Cruzamos el puente y llegamos a un camino en medio de un bosque inmenso."
    ]


def test_word_import_is_idempotent(session_factory):
    paths = sorted(DICTIONARIES.glob("dictionary-*.json"))

    first = import_word_files(paths, session_factory)
    second = import_word_files(paths, session_factory)

    assert sum(r.inserted for r in first) == sum(r.parsed for r in first)
    assert sum(r.inserted for r in second) == 0
    with session_factory() as session:
        total = session.scalar(select(func.count()).select_from(WordPair))
    assert total == sum(r.parsed for r in first)


def test_word_round_never_repeats_a_question_or_an_answer(session_factory):
    pairs, _ = load_dictionary_file(DICTIONARIES / "dictionary-en-es.json")
    with session_factory.begin() as session:
        WordPairRepository(session).upsert_many(pairs)

    for _ in range(20):
        with session_factory() as session:
            round_pairs = WordPairRepository(session).random_round("en-es", 20)
        questions = [p.source_text for p in round_pairs]
        answers = [p.target_text for p in round_pairs]
        assert len(questions) == len(set(questions))
        assert len(answers) == len(set(answers))


def test_progress_mastery_goes_up_down_and_stays_in_range(session_factory):
    results = [True, True, True, True, True, True, False, False]
    seen = []
    for correct in results:
        with session_factory.begin() as session:
            row = ProgressRepository(session).record(USER, "sentence", "14007817", correct)
            seen.append((row.attempts, row.correct_count, row.mastery_level))

    assert [m for _, _, m in seen] == [1, 2, 3, 4, 5, 5, 4, 3]
    assert seen[-1][:2] == (8, 6)


def test_next_review_doubles_with_mastery(session_factory):
    with session_factory.begin() as session:
        repo = ProgressRepository(session)
        repo.record(USER, "word", "en-es:fish", True)
        row = repo.record(USER, "word", "en-es:fish", True)
        gap = row.next_review_at - row.last_attempted_at

    assert row.mastery_level == 2
    assert gap == timedelta(days=4)


def test_first_wrong_answer_starts_at_zero(session_factory):
    with session_factory.begin() as session:
        row = ProgressRepository(session).record(USER, "word", "en-es:cat", False)

    assert (row.attempts, row.correct_count, row.mastery_level) == (1, 0, 0)
    assert row.next_review_at - row.last_attempted_at == timedelta(days=1)
