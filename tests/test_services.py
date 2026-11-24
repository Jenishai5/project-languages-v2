import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from langapp.api.deps import get_system_service
from langapp.api.main import app
from langapp.errors import InvalidRequest, NotFound, ServiceUnavailable
from langapp.services.games import GameService
from langapp.services.languages import LanguageCatalog
from langapp.services.system import SystemService
from langapp.services.user_settings import LanguageChoice, UserSettingsService

USER = uuid.uuid4()


class FakeConcepts:
    def languages(self) -> dict[str, int]:
        return {"eng": 300, "spa": 300, "rus": 60}


class FakeSettingsRepo:
    def __init__(self) -> None:
        self.rows: dict[uuid.UUID, SimpleNamespace] = {}

    def get_settings(self, user_id):
        return self.rows.get(user_id)

    def save_settings(self, user_id, native_lang, learning_lang):
        self.rows[user_id] = SimpleNamespace(native_lang=native_lang, learning_lang=learning_lang)
        return self.rows[user_id]


class BrokenDatabase:
    def ping(self) -> None:
        raise OperationalError("SELECT 1", {}, Exception("password authentication failed for user langapp"))


class EmptyRepo:
    def random_for_builder(self, *args):
        return []

    def random_round(self, *args):
        return []


def settings_service() -> UserSettingsService:
    return UserSettingsService(FakeSettingsRepo(), LanguageCatalog(FakeConcepts()))


def test_settings_are_saved_and_read_back():
    service = settings_service()

    service.save(USER, LanguageChoice(native_lang="rus", learning_lang="eng"))

    assert service.get(USER) == LanguageChoice(native_lang="rus", learning_lang="eng")


def test_settings_reject_same_or_unknown_languages():
    service = settings_service()

    with pytest.raises(InvalidRequest, match="must be different"):
        service.save(USER, LanguageChoice(native_lang="eng", learning_lang="eng"))
    with pytest.raises(InvalidRequest, match="'cat' is not available"):
        service.save(USER, LanguageChoice(native_lang="cat", learning_lang="eng"))
    with pytest.raises(NotFound):
        service.get(USER)


def test_games_explain_how_to_fill_empty_data():
    service = GameService(EmptyRepo(), EmptyRepo())

    with pytest.raises(NotFound, match="make import-builder"):
        service.builder_round(5, 8)
    with pytest.raises(NotFound, match="make import-words"):
        service.word_match("en-es", 5)
    with pytest.raises(InvalidRequest, match="Unknown language"):
        service.word_match("xx-yy", 5)


def test_health_hides_database_details_from_clients():
    service = SystemService(BrokenDatabase(), EmptyRepo(), EmptyRepo())

    with pytest.raises(ServiceUnavailable) as error:
        service.check()

    assert "password" not in str(error.value)


def test_errors_have_one_json_shape():
    app.dependency_overrides[get_system_service] = lambda: SystemService(BrokenDatabase(), EmptyRepo(), EmptyRepo())
    try:
        response = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable. Is it running? Try: make db"}
