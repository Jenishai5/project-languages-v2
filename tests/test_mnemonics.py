import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_mnemonic_service, get_session, get_token_verifier
from langapp.api.main import app
from langapp.domain import GeneratedImage, ParsedConcept
from langapp.errors import ExternalSourceError, InvalidRequest, RateLimited, UpstreamRateLimited
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.services.languages import LanguageCatalog
from langapp.services.mnemonics import MnemonicService, MnemonicSettings, image_path_for, mask_sentence, word_forms
from tests.test_lessons import USER, FakeVerifier
from tests.test_usage_summary import contract_validator

AUTH = {"Authorization": "Bearer good-token"}
SETTINGS = MnemonicSettings(image_model="img:free", daily_limit=2, signed_url_seconds=60)


class FakeImages:
    def __init__(self, missing: tuple[str, ...] = (), rate_limited: bool = False) -> None:
        self.missing = missing
        self.rate_limited = rate_limited
        self.prompts: list[str] = []
        self.models: list[str] = []

    def generate_image(self, model, prompt, user=None):
        self.prompts.append(prompt)
        self.models.append(model)
        if self.rate_limited:
            raise UpstreamRateLimited("busy")
        if model in self.missing:
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


def seed_concepts(session_factory) -> dict[str, int]:
    concepts = [
        ParsedConcept(slug="woman", category="people", terms={"eng": "woman", "spa": "la mujer"}, emoji="👩"),
        ParsedConcept(slug="doctor", category="people", terms={"eng": "doctor", "spa": "el médico / la médica"}),
        ParsedConcept(slug="cat", category="animals", terms={"eng": "cat", "spa": "el gato"}, emoji="🐱"),
    ]
    with session_factory.begin() as session:
        return ConceptRepository(session).upsert_concepts(concepts)


def make_service(session, images=None, store=None, settings=SETTINGS) -> MnemonicService:
    return MnemonicService(
        MnemonicRepository(session),
        ConceptRepository(session),
        LanguageCatalog(ConceptRepository(session)),
        images=images,
        store=store,
        settings=settings,
        clock=lambda: datetime.now(UTC),
    )


def test_word_forms_drop_articles_and_split_variants():
    assert word_forms("el médico / la médica", "spa") == ["médica", "médico"]
    assert word_forms("woman", "eng") == ["woman"]
    assert word_forms("to eat", "eng") == ["eat"]


@pytest.mark.parametrize(
    ("sentence", "term", "lang", "expected"),
    [
        ("The woman reads a book.", "woman", "eng", "The ___ reads a book."),
        ("WOMAN at work", "woman", "eng", "___ at work"),
        ("Two cats sleep.", "cat", "eng", "Two ___ sleep."),
        ("La médica trabaja mucho.", "el médico / la médica", "spa", "La ___ trabaja mucho."),
        ("Я вижу врача.", "врач", "rus", "Я вижу ___."),
        ("A catalogue of things.", "cat", "eng", None),
        ("The man is tall.", "woman", "eng", None),
    ],
)
def test_mask_sentence(sentence, term, lang, expected):
    assert mask_sentence(sentence, term, lang) == expected


def test_image_path_is_per_user_word_and_languages():
    user = uuid.UUID("8c5b4a3e-2f1d-4c6b-9a8e-7d6c5b4a3e2f")

    assert image_path_for(user, 7, "eng", "spa", "image/webp") == f"{user}/7-eng-spa.webp"


def test_saving_a_sentence_draws_it_and_makes_a_gap(session_factory):
    ids = seed_concepts(session_factory)
    images, store = FakeImages(), FakeStore()

    with session_factory.begin() as session:
        card = make_service(session, images, store).save(USER.id, ids["woman"], "eng", "spa", "  The woman   reads a book. ")

    assert card["sentence"] == "The woman reads a book."
    assert card["masked_sentence"] == "The ___ reads a book."
    assert card["translation"] == "la mujer"
    assert card["image_url"] == f"https://signed.test/{USER.id}/{ids['woman']}-eng-spa.png"
    assert images.prompts[0].startswith('Scene: "The woman reads a book."')
    assert "felt craft" in images.prompts[0]


def test_sentence_must_use_the_word(session_factory):
    ids = seed_concepts(session_factory)

    with session_factory.begin() as session, pytest.raises(InvalidRequest, match="Use the word “woman”"):
        make_service(session, FakeImages(), FakeStore()).save(USER.id, ids["woman"], "eng", "spa", "The man reads.")


def test_rewriting_replaces_the_sentence_and_picture(session_factory):
    ids = seed_concepts(session_factory)
    images, store = FakeImages(), FakeStore()

    with session_factory.begin() as session:
        first = make_service(session, images, store).save(USER.id, ids["cat"], "eng", "spa", "A cat sleeps.")
    with session_factory.begin() as session:
        second = make_service(session, images, store).save(USER.id, ids["cat"], "eng", "spa", "My cat eats fish.")
        listing = make_service(session, images, store).list(USER.id, "eng", "spa")

    assert second["id"] == first["id"]
    assert second["sentence"] == "My cat eats fish."
    assert len(listing["mnemonics"]) == 1
    assert len(images.prompts) == 2


def test_every_picture_request_counts_towards_the_daily_limit(session_factory):
    ids = seed_concepts(session_factory)
    images, store = FakeImages(), FakeStore()

    with session_factory.begin() as session:
        service = make_service(session, images, store)
        service.save(USER.id, ids["cat"], "eng", "spa", "A cat sleeps.")
        service.save(USER.id, ids["cat"], "eng", "spa", "A cat runs.")
        with pytest.raises(RateLimited):
            service.save(USER.id, ids["woman"], "eng", "spa", "The woman sings.")
        listing = service.list(USER.id, "eng", "spa")

    assert listing["remaining_today"] == 0
    assert [m["slug"] for m in listing["mnemonics"]] == ["cat"]


def test_next_image_model_is_tried_and_failures_still_count(session_factory):
    ids = seed_concepts(session_factory)
    images = FakeImages(missing=("old:free",))
    settings = MnemonicSettings(image_model="old:free, new:free", daily_limit=5, signed_url_seconds=60)

    with session_factory.begin() as session:
        service = make_service(session, images, FakeStore(), settings)
        card = service.save(USER.id, ids["cat"], "eng", "spa", "A cat sleeps.")
        remaining = service.list(USER.id, "eng", "spa")["remaining_today"]

    assert images.models == ["old:free", "new:free"]
    assert card["image_url"] is not None
    assert remaining == 3


def test_rate_limit_keeps_the_sentence_without_a_picture(session_factory):
    ids = seed_concepts(session_factory)
    images = FakeImages(rate_limited=True)
    settings = MnemonicSettings(image_model="a:free,b:free", daily_limit=5, signed_url_seconds=60)

    with session_factory.begin() as session:
        card = make_service(session, images, FakeStore(), settings).save(USER.id, ids["cat"], "eng", "spa", "A cat sleeps.")

    assert images.models == ["a:free"]
    assert card["image_url"] is None
    assert card["emoji"] == "🐱"


def test_without_ai_the_sentence_is_saved_and_no_limit_is_used(session_factory):
    ids = seed_concepts(session_factory)

    with session_factory.begin() as session:
        service = make_service(session)
        card = service.save(USER.id, ids["cat"], "eng", "spa", "A cat sleeps.")
        listing = service.list(USER.id, "eng", "spa")

    assert card["image_url"] is None
    assert listing["pictures_enabled"] is False
    assert listing["remaining_today"] == 2


@pytest.fixture
def api(session_factory):
    store = FakeStore()

    def override_session():
        with session_factory.begin() as session:
            yield session

    def override_service():
        with session_factory.begin() as session:
            yield make_service(session, FakeImages(), store)

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_mnemonic_service] = override_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_api_saves_and_lists_cards(api, session_factory):
    ids = seed_concepts(session_factory)
    body = {"concept_id": ids["woman"], "learning": "eng", "native": "spa", "sentence": "The woman reads."}

    created = api.post("/mnemonics", json=body, headers=AUTH)
    listing = api.get("/mnemonics", params={"learning": "eng", "native": "spa"}, headers=AUTH)

    assert created.status_code == 200
    assert created.json()["masked_sentence"] == "The ___ reads."
    assert listing.json()["remaining_today"] == 1
    assert listing.json()["pictures_enabled"] is True
    assert [m["slug"] for m in listing.json()["mnemonics"]] == ["woman"]


def test_api_errors(api, session_factory):
    ids = seed_concepts(session_factory)
    base = {"learning": "eng", "native": "spa"}

    assert api.get("/mnemonics").status_code == 401
    assert api.post("/mnemonics", json={**base, "concept_id": ids["woman"]}, headers=AUTH).status_code == 422
    wrong = api.post("/mnemonics", json={**base, "concept_id": ids["woman"], "sentence": "No word here."}, headers=AUTH)
    assert wrong.status_code == 400
    assert wrong.json() == {"detail": "Use the word “woman” in your sentence."}
    unknown = api.post("/mnemonics", json={**base, "concept_id": max(ids.values()) + 99, "sentence": "x y z"}, headers=AUTH)
    assert unknown.status_code == 404


def test_api_answers_match_the_contract(api, session_factory):
    ids = seed_concepts(session_factory)
    base = {"learning": "eng", "native": "spa", "concept_id": ids["woman"]}

    created = api.post("/mnemonics", json={**base, "sentence": "The woman reads."}, headers=AUTH)
    listing = api.get("/mnemonics", params={"learning": "eng", "native": "spa"}, headers=AUTH)
    rule = api.post("/mnemonics", json={**base, "sentence": "No word here."}, headers=AUTH)
    shape = api.post("/mnemonics", json={**base, "sentence": ""}, headers=AUTH)
    same_language = api.get("/mnemonics", params={"learning": "eng", "native": "eng"}, headers=AUTH)

    assert contract_validator("Mnemonic").is_valid(created.json())
    assert contract_validator("MnemonicList").is_valid(listing.json())
    assert rule.status_code == 400
    assert contract_validator("Error").is_valid(rule.json())
    assert shape.status_code == 422
    assert contract_validator("ValidationError").is_valid(shape.json())
    assert same_language.status_code == 400
    assert contract_validator("Error").is_valid(same_language.json())
