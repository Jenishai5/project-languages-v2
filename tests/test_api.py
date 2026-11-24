import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_session
from langapp.api.main import app
from langapp.ingestion.parser import parse_page
from langapp.repositories.sentences import SentenceRepository
from tests.conftest import load_fixture


@pytest.fixture
def api(session_factory):
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(parse_page(load_fixture("tatoeba_page.json")).sentences)

    def override_session():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health(api):
    response = api.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "sentences": 8}


def test_list_sentences_with_translation_filter(api):
    response = api.get("/sentences", params={"lang": "spa", "translation_lang": "eng", "limit": 2})

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert all(t["lang"] == "eng" for item in body["items"] for t in item["translations"])


def test_get_sentence_and_404(api):
    found = api.get("/sentences/14132239")
    missing = api.get("/sentences/1")

    assert found.json()["translations"][0]["text"] == "Tom is supposed to be in his office now."
    assert missing.status_code == 404


def test_random_sentence(api):
    response = api.get("/sentences/random", params={"lang": "spa", "translation_lang": "rus"})

    assert response.status_code == 200
    assert response.json()["id"] in {14132454, 14132322}


def test_invalid_query_is_rejected(api):
    assert api.get("/sentences", params={"lang": "SPANISH"}).status_code == 422
    assert api.get("/sentences", params={"limit": 1000}).status_code == 422


def test_home_page_is_served():
    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "TurtleTalk" in response.text
