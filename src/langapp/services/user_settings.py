import uuid
from dataclasses import dataclass

from langapp.errors import NotFound
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.languages import LanguageCatalog


@dataclass(frozen=True)
class LanguageChoice:
    native_lang: str
    learning_lang: str


class UserSettingsService:
    def __init__(self, repo: UserSettingsRepository, catalog: LanguageCatalog) -> None:
        self._repo = repo
        self._catalog = catalog

    def get(self, user_id: uuid.UUID) -> LanguageChoice:
        settings = self._repo.get_settings(user_id)
        if settings is None:
            raise NotFound("No language settings yet")
        return LanguageChoice(settings.native_lang, settings.learning_lang)

    def save(self, user_id: uuid.UUID, choice: LanguageChoice) -> LanguageChoice:
        self._catalog.ensure_pair(choice.learning_lang, choice.native_lang)
        saved = self._repo.save_settings(user_id, choice.native_lang, choice.learning_lang)
        return LanguageChoice(saved.native_lang, saved.learning_lang)
