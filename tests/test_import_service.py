import httpx
import pytest
import respx

from langapp.ingestion.tatoeba_client import TatoebaClient
from langapp.repositories.sentences import SentenceRepository
from langapp.services.import_service import SentenceImporter
from tests.conftest import load_fixture

BASE = "https://api.tatoeba.org"
NEXT = f"{BASE}/v1/sentences?after=page2"


@pytest.fixture
def client():
    with TatoebaClient(base_url=BASE, max_retries=1, min_interval_seconds=0, sleep=lambda _: None) as tatoeba:
        yield tatoeba


def first_page() -> dict:
    payload = load_fixture("tatoeba_page.json")
    payload["paging"] = {"total": 4, "has_next": True, "next": NEXT}
    return payload


@respx.mock
def test_import_twice_is_idempotent(client, session_factory):
    respx.get(f"{BASE}/v1/sentences").mock(return_value=httpx.Response(200, json=first_page()))
    importer = SentenceImporter(client, session_factory)

    first = importer.run("spa", ["eng", "rus"], max_pages=1).run
    second = importer.run("spa", ["eng", "rus"], max_pages=1).run

    assert (first.status, first.inserted, first.fetched) == ("succeeded", 8, 3)
    assert (second.status, second.inserted, second.updated) == ("succeeded", 0, 0)
    with session_factory() as session:
        assert SentenceRepository(session).count() == 8


@respx.mock
def test_failure_keeps_saved_pages_and_marks_run_failed(client, session_factory):
    respx.get(f"{BASE}/v1/sentences", params={"lang": "spa"}).mock(
        return_value=httpx.Response(200, json=first_page())
    )
    respx.get(NEXT).mock(return_value=httpx.Response(503))

    run = SentenceImporter(client, session_factory).run("spa", ["eng", "rus"], max_pages=5).run

    assert run.status == "failed"
    assert "HTTP 503" in run.error
    assert run.pages == 1
    assert run.last_cursor == NEXT
    assert run.finished_at is not None
    with session_factory() as session:
        assert SentenceRepository(session).count() == 8


@respx.mock
def test_bad_records_are_skipped_not_fatal(client, session_factory):
    respx.get(f"{BASE}/v1/sentences").mock(
        return_value=httpx.Response(200, json=load_fixture("tatoeba_page_messy.json"))
    )

    summary = SentenceImporter(client, session_factory).run("spa", [], max_pages=1)

    assert summary.run.status == "succeeded"
    assert summary.run.skipped == 5
    assert summary.issues
