import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_session, get_token_verifier
from langapp.api.main import app
from langapp.auth import AuthError, AuthUser
from langapp.ingestion.parser import parse_page
from langapp.repositories.sentences import SentenceRepository
from langapp.services.word_import import import_word_files
from tests.conftest import load_fixture

DICTIONARIES = Path(__file__).resolve().parent.parent / "data" / "dictionaries"
USER = AuthUser(id=uuid.UUID("8c5b4a3e-2f1d-4c6b-9a8e-7d6c5b4a3e2f"), email="jeni@example.com")


class FakeVerifier:
    def verify(self, token: str) -> AuthUser:
        if token != "good-token":
            raise AuthError("invalid or expired token")
        return USER


@pytest.fixture
def client(session_factory):
    def override_session():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def with_data(session_factory):
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many(parse_page(load_fixture("tatoeba_eng_audio_page.json")).sentences)
    import_word_files(sorted(DICTIONARIES.glob("dictionary-*.json")), session_factory)


def test_sentences_match_the_old_frontend_contract(client, with_data):
    response = client.get("/game/sentences")

    body = response.json()
    assert response.status_code == 200
    dad = next(s for s in body["sentences"] if s["id"] == 14007817)
    assert dad["full_text"] == "Dad is proud of his car."
    assert dad["translation"] == {"es": "Papá está orgulloso de su coche.", "ru": "Отец гордится своей машиной."}
    assert [w["form"] for w in dad["words"]] == ["Dad", "is", "proud", "of", "his", "car"]
    assert [w["position"] for w in dad["words"]] == [0, 1, 2, 3, 4, 5]
    assert dad["words"][1]["word_type"] == "verb"
    assert dad["level"] == "A2"
    assert dad["audio"]["url"] == "https://api.tatoeba.org/v1/audio/1285708/file"
    assert dad["audio"]["author"] == "rul"


def test_sentences_without_data_explain_what_to_do(client):
    response = client.get("/game/sentences")

    assert response.status_code == 404
    assert "make import-builder" in response.json()["error"]


def test_word_match_round(client, with_data):
    response = client.get("/game/wordmatch", params={"language": "en-es", "limit": 5})

    body = response.json()
    assert response.status_code == 200
    assert len(body["pairs"]) == 5
    assert body["imageMode"] is None
    assert set(body["pairs"][0]) == {"question", "answer"}


def test_word_match_emoji_and_errors(client, with_data):
    emojis = client.get("/game/wordmatch", params={"language": "es-emojis"})
    image = client.get("/game/wordmatch", params={"language": "en-image"})
    unknown = client.get("/game/wordmatch", params={"language": "xx-yy"})

    assert emojis.status_code == 200
    assert image.status_code == 400
    assert "Image modes" in image.json()["error"]
    assert unknown.status_code == 400


def test_progress_needs_a_valid_token(client):
    no_token = client.post("/progress/sentence", json={"exercise_id": 1, "correct": True})
    bad_token = client.post(
        "/progress/sentence",
        json={"exercise_id": 1, "correct": True},
        headers={"Authorization": "Bearer nope"},
    )

    assert no_token.status_code == 401
    assert bad_token.status_code == 401


def test_progress_is_saved_and_listed(client):
    headers = {"Authorization": "Bearer good-token"}

    first = client.post("/progress/sentence", json={"exercise_id": 14007817, "correct": True}, headers=headers)
    second = client.post("/progress/sentence", json={"exercise_id": 14007817, "correct": True}, headers=headers)
    word = client.post("/progress/word", json={"lemma": "fish", "language": "en-es", "correct": False}, headers=headers)
    listing = client.get("/progress/sentences", headers=headers)

    assert first.json()["mastery"] == 1
    assert second.json()["mastery"] == 2
    assert word.json()["mastery"] == 0
    assert listing.json()["progress"]["14007817"]["attempts"] == 2
    assert listing.json()["progress"]["14007817"]["correct"] == 2


def test_progress_rejects_bad_input(client):
    headers = {"Authorization": "Bearer good-token"}

    assert client.post("/progress/sentence", json={"exercise_id": -3, "correct": True}, headers=headers).status_code == 422
    assert client.post("/progress/word", json={"lemma": "", "correct": True}, headers=headers).status_code == 422


def test_login_not_configured(session_factory):
    app.dependency_overrides[get_token_verifier] = lambda: None
    try:
        response = TestClient(app).get("/progress/sentences", headers={"Authorization": "Bearer x"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
