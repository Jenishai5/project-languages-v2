from sqlalchemy import func, select

from langapp.db.models import Sentence, SentenceLink
from langapp.ingestion.parser import parse_page
from langapp.repositories.sentences import SentenceRepository
from tests.conftest import load_fixture


def counts(session) -> tuple[int, int]:
    sentences = session.scalar(select(func.count()).select_from(Sentence))
    links = session.scalar(select(func.count()).select_from(SentenceLink))
    return sentences, links


def test_first_upsert_inserts_sentences_translations_and_links(session_factory):
    sentences = parse_page(load_fixture("tatoeba_page.json")).sentences

    with session_factory.begin() as session:
        stats = SentenceRepository(session).upsert_many(sentences)

    assert (stats.inserted, stats.updated, stats.unchanged) == (8, 0, 0)
    with session_factory() as session:
        assert counts(session) == (8, 5)


def test_running_the_same_upsert_twice_creates_no_duplicates(session_factory):
    sentences = parse_page(load_fixture("tatoeba_page.json")).sentences

    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(sentences)
    with session_factory.begin() as session:
        stats = SentenceRepository(session).upsert_many(sentences)

    assert (stats.inserted, stats.updated, stats.unchanged) == (0, 0, 8)
    with session_factory() as session:
        assert counts(session) == (8, 5)


def test_changed_text_is_updated_not_duplicated(session_factory):
    payload = load_fixture("tatoeba_page.json")
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(parse_page(payload).sentences)

    payload["data"][0]["text"] = "Cruzamos el puente."
    with session_factory.begin() as session:
        stats = SentenceRepository(session).upsert_many(parse_page(payload).sentences)

    assert (stats.inserted, stats.updated) == (0, 1)
    with session_factory() as session:
        assert session.get(Sentence, 14132454).text == "Cruzamos el puente."
        assert counts(session) == (8, 5)


def test_empty_input_does_nothing(session_factory):
    with session_factory.begin() as session:
        stats = SentenceRepository(session).upsert_many([])

    assert (stats.inserted, stats.updated, stats.unchanged) == (0, 0, 0)


def test_list_filters_by_language_and_translation_language(session_factory):
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(parse_page(load_fixture("tatoeba_page.json")).sentences)

    with session_factory() as session:
        repo = SentenceRepository(session)
        spanish, total_spanish = repo.list(lang="spa")
        with_russian, total_russian = repo.list(lang="spa", translation_lang="rus")
        found, _ = repo.list(search="oficina")

    assert total_spanish == 3
    assert total_russian == 2
    assert [s.id for s in found] == [14132239]
    by_id = {s.id: s for s in spanish}
    assert {link.translation.lang for link in by_id[14132454].links} == {"eng", "rus"}
    assert {link.translation.lang for link in by_id[14132239].links} == {"eng"}
