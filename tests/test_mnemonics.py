import json
import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_mnemonic_service, get_session, get_token_verifier
from langapp.api.main import app
from langapp.domain import ChatReply, GeneratedImage, ParsedConcept
from langapp.errors import ExternalSourceError, RateLimited, ServiceUnavailable
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.services.languages import LanguageCatalog
from langapp.services.mnemonics import MnemonicService, MnemonicSettings, image_path_for, mnemonic_messages, parse_idea
from tests.test_lessons import USER, FakeVerifier

AUTH = {"Authorization": "Bearer good-token"}
SETTINGS = MnemonicSettings(text_model="openrouter/free", image_model="img:free", daily_limit=2, signed_url_seconds=60)


class FakeChat:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls: list[list[dict]] = []

    def chat(self, model, messages, user=None):
        self.calls.append(messages)
        return ChatReply(text=self.text, model="nvidia/nemotron:free")


class FakeImages:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.prompts: list[str] = []

    def generate_image(self, model, prompt, user=None):
        self.prompts.append(prompt)
        if self.fail:
            raise ExternalSourceError("free image model is gone")
        return GeneratedImage(data=b"png-bytes", media_type="image/png", model=model)


class FakeStore:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    def save(self, path, data, content_type):
        self.files[path] = data
        return path

    def signed_urls(self, paths, expires_in):
        return {p: f"https://signed.test/{p}" for p in paths if p in self.files}


REPLY = json.dumps(
    {"mnemonic": "Imagina un pato que lee el \"paper\" en la oficina.", "image_prompt": "A duck reading a newspaper"}
)


def seed_concepts(session_factory) -> dict[str, int]:
    concepts = [
        ParsedConcept(slug="paper", category="objects", terms={"eng": "paper", "spa": "el papel"}, emoji="📄"),
        ParsedConcept(slug="doctor", category="people", terms={"eng": "doctor", "spa": "el médico"}),
        ParsedConcept(slug="cat", category="animals", terms={"eng": "cat", "spa": "el gato"}, emoji="🐱"),
    ]
    with session_factory.begin() as session:
        return ConceptRepository(session).upsert_concepts(concepts)


def make_service(session, chat=None, images=None, store=None, settings=SETTINGS) -> MnemonicService:
    return MnemonicService(
        MnemonicRepository(session),
        ConceptRepository(session),
        LanguageCatalog(ConceptRepository(session)),
        chat=chat,
        images=images,
        store=store,
        settings=settings,
        clock=lambda: datetime.now(UTC),
    )


def test_parse_idea_reads_json_even_inside_code_fences():
    idea = parse_idea('Sure!\n```json\n{"mnemonic": "Un pato.", "image_prompt": "A duck"}\n```', "pato")

    assert idea.text == "Un pato."
    assert idea.image_prompt == "A duck"


def test_parse_idea_falls_back_to_plain_text():
    idea = parse_idea("Think of a duck holding a pot.", "pato")

    assert idea.text == "Think of a duck holding a pot."
    assert idea.image_prompt == 'A scene that shows "pato"'


def test_prompt_asks_for_the_native_language_and_json():
    system, user = mnemonic_messages("paper", "el papel", "eng", "spa")

    assert "written in Spanish" in system["content"]
    assert '"image_prompt"' in system["content"]
    assert user["content"] == 'Word to learn (English): "paper". Meaning (Spanish): "el papel".'


def test_image_path_is_per_user_word_and_languages():
    user = uuid.UUID("8c5b4a3e-2f1d-4c6b-9a8e-7d6c5b4a3e2f")

    assert image_path_for(user, 7, "eng", "spa", "image/webp") == f"{user}/7-eng-spa.webp"


def test_create_generates_text_and_image_once_then_reuses(session_factory):
    ids = seed_concepts(session_factory)
    chat, images, store = FakeChat(REPLY), FakeImages(), FakeStore()

    with session_factory.begin() as session:
        first = make_service(session, chat, images, store).create(USER.id, ids["paper"], "eng", "spa")
    with session_factory.begin() as session:
        second = make_service(session, chat, images, store).create(USER.id, ids["paper"], "eng", "spa")

    assert first["word"] == "paper"
    assert first["translation"] == "el papel"
    assert first["mnemonic"].startswith("Imagina un pato")
    assert first["image_url"] == f"https://signed.test/{USER.id}/{ids['paper']}-eng-spa.png"
    assert "felt craft" in images.prompts[0]
    assert second["id"] == first["id"]
    assert len(chat.calls) == 1
    assert len(images.prompts) == 1


def test_failed_image_keeps_the_text_and_falls_back_to_emoji(session_factory):
    ids = seed_concepts(session_factory)

    with session_factory.begin() as session:
        service = make_service(session, FakeChat(REPLY), FakeImages(fail=True), FakeStore())
        result = service.create(USER.id, ids["paper"], "eng", "spa")

    assert result["image_url"] is None
    assert result["emoji"] == "📄"
    assert result["mnemonic"]


def test_daily_limit_stops_new_mnemonics(session_factory):
    ids = seed_concepts(session_factory)
    chat = FakeChat(REPLY)

    with session_factory.begin() as session:
        service = make_service(session, chat, None, None)
        service.create(USER.id, ids["paper"], "eng", "spa")
        service.create(USER.id, ids["doctor"], "eng", "spa")
        with pytest.raises(RateLimited):
            service.create(USER.id, ids["cat"], "eng", "spa")
        listing = service.list(USER.id, "eng", "spa")

    assert listing["remaining_today"] == 0
    assert [m["word"] for m in listing["mnemonics"]] == ["doctor", "paper"]


def test_without_an_api_key_creating_is_unavailable(session_factory):
    ids = seed_concepts(session_factory)

    with session_factory.begin() as session, pytest.raises(ServiceUnavailable, match="OPENROUTER_API_KEY"):
        make_service(session).create(USER.id, ids["paper"], "eng", "spa")


@pytest.fixture
def api(session_factory):
    store = FakeStore()

    def override_session():
        with session_factory.begin() as session:
            yield session

    def override_service():
        with session_factory.begin() as session:
            yield make_service(session, FakeChat(REPLY), FakeImages(), store)

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_mnemonic_service] = override_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_api_creates_and_lists_mnemonics(api, session_factory):
    ids = seed_concepts(session_factory)

    created = api.post("/mnemonics", json={"concept_id": ids["paper"], "learning": "eng", "native": "spa"}, headers=AUTH)
    listing = api.get("/mnemonics", params={"learning": "eng", "native": "spa"}, headers=AUTH)

    assert created.status_code == 200
    assert created.json()["image_url"].startswith("https://signed.test/")
    assert listing.json()["daily_limit"] == 2
    assert listing.json()["remaining_today"] == 1
    assert [m["slug"] for m in listing.json()["mnemonics"]] == ["paper"]


def test_api_requires_login_and_valid_input(api, session_factory):
    ids = seed_concepts(session_factory)

    assert api.get("/mnemonics").status_code == 401
    assert api.post("/mnemonics", json={"concept_id": 0, "learning": "eng", "native": "spa"}, headers=AUTH).status_code == 422
    unknown = {"concept_id": max(ids.values()) + 99, "learning": "eng", "native": "spa"}
    missing = api.post("/mnemonics", json=unknown, headers=AUTH)
    assert missing.status_code == 404
