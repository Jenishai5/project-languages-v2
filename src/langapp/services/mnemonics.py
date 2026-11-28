from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from langapp.db.models import Concept, Mnemonic
from langapp.domain import GeneratedImage
from langapp.errors import ExternalSourceError, InvalidRequest, NotFound, RateLimited, UpstreamRateLimited
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.services.idempotency import IdempotentRequests
from langapp.services.languages import LanguageCatalog
from langapp.services.ports import ImageModel, ImageStore

logger = logging.getLogger(__name__)

SAVE_OPERATION = "mnemonics.save"
MIN_SENTENCE_LENGTH = 3
MAX_SENTENCE_LENGTH = 200
GAP = "___"
IMAGE_STYLE = (
    "Draw this scene as a handmade felt craft illustration with soft stitched edges, one clear subject, "
    "plain soft matcha green background, friendly and family-friendly. "
    "No text, no letters, no words in the image."
)
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
ARTICLES = {
    "eng": ("the", "a", "an", "to"),
    "spa": ("el", "la", "los", "las", "un", "una", "unos", "unas"),
}
ENDINGS = {
    "eng": r"(?:s|es)?",
    "spa": r"(?:s|es)?",
    "rus": r"\w{0,3}",
}


@dataclass(frozen=True)
class MnemonicSettings:
    image_model: str
    daily_limit: int
    signed_url_seconds: int

    @property
    def image_models(self) -> list[str]:
        return [model.strip() for model in self.image_model.split(",") if model.strip()]


def clean_sentence(sentence: str) -> str:
    return " ".join(sentence.split())


def word_forms(term: str, lang: str) -> list[str]:
    articles = ARTICLES.get(lang, ())
    forms = []
    for variant in term.split("/"):
        words = variant.strip().split()
        if len(words) > 1 and words[0].lower() in articles:
            words = words[1:]
        if words:
            forms.append(" ".join(words))
    return sorted(set(forms), key=lambda form: (-len(form), form))


def mask_sentence(sentence: str, term: str, lang: str) -> str | None:
    ending = ENDINGS.get(lang, "")
    for form in word_forms(term, lang):
        pattern = re.compile(rf"(?<!\w){re.escape(form)}{ending}(?!\w)", re.IGNORECASE)
        if pattern.search(sentence):
            return pattern.sub(GAP, sentence, count=1)
    return None


def image_prompt(sentence: str) -> str:
    return f'Scene: "{sentence}". {IMAGE_STYLE}'


def image_path_for(user_id: uuid.UUID, concept_id: int, learning: str, native: str, media_type: str) -> str:
    return f"{user_id}/{concept_id}-{learning}-{native}.{EXTENSIONS.get(media_type, 'png')}"


def _term(concept: Concept, lang: str) -> str | None:
    return next((term.text for term in concept.terms if term.lang == lang), None)


def mnemonic_view(mnemonic: Mnemonic, image_url: str | None) -> dict:
    concept = mnemonic.concept
    word = _term(concept, mnemonic.learning_lang) or concept.slug
    return {
        "id": mnemonic.id,
        "concept_id": mnemonic.concept_id,
        "slug": concept.slug,
        "word": word,
        "translation": _term(concept, mnemonic.native_lang) or "",
        "emoji": concept.emoji,
        "sentence": mnemonic.text,
        "masked_sentence": mask_sentence(mnemonic.text, word, mnemonic.learning_lang) or GAP,
        "image_url": image_url,
        "created_at": mnemonic.created_at,
    }


class MnemonicService:
    def __init__(
        self,
        mnemonics: MnemonicRepository,
        concepts: ConceptRepository,
        catalog: LanguageCatalog,
        images: ImageModel | None,
        store: ImageStore | None,
        settings: MnemonicSettings,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        idempotency: IdempotentRequests | None = None,
    ) -> None:
        self._idempotency = idempotency
        self._mnemonics = mnemonics
        self._concepts = concepts
        self._catalog = catalog
        self._images = images
        self._store = store
        self._settings = settings
        self._clock = clock

    @property
    def _can_draw(self) -> bool:
        return self._images is not None and self._store is not None

    def list(self, user_id: uuid.UUID, learning: str, native: str) -> dict:
        self._catalog.ensure_pair(learning, native)
        items = self._mnemonics.list_for_user(user_id, learning, native)
        urls = self._signed_urls([m.image_path for m in items if m.image_path])
        return {
            "mnemonics": [mnemonic_view(m, urls.get(m.image_path or "")) for m in items],
            "daily_limit": self._settings.daily_limit,
            "remaining_today": self._remaining(user_id),
            "pictures_enabled": self._can_draw,
        }

    def save(self, user_id: uuid.UUID, concept_id: int, learning: str, native: str, sentence: str) -> dict:
        self._catalog.ensure_pair(learning, native)
        concept = self._concepts.get_with_terms(concept_id)
        if concept is None:
            raise NotFound(f"Word {concept_id} not found")
        word, translation = _term(concept, learning), _term(concept, native)
        if word is None or translation is None:
            raise NotFound("This word has no translation in your languages yet")

        text = clean_sentence(sentence)
        if not MIN_SENTENCE_LENGTH <= len(text) <= MAX_SENTENCE_LENGTH:
            raise InvalidRequest(f"Write a sentence between {MIN_SENTENCE_LENGTH} and {MAX_SENTENCE_LENGTH} characters.")
        if mask_sentence(text, word, learning) is None:
            raise InvalidRequest(f"Use the word “{word_forms(word, learning)[0]}” in your sentence.")

        image_path, image_model = self._draw(user_id, concept_id, learning, native, text)
        existing = self._mnemonics.find(user_id, concept_id, learning, native)
        if existing:
            saved = self._mnemonics.update(existing, text, image_path, image_model)
        else:
            saved = self._mnemonics.add(user_id, concept_id, learning, native, text, image_path, None, image_model)
        return self._view(saved)

    def save_once(
        self,
        user_id: uuid.UUID,
        concept_id: int,
        learning: str,
        native: str,
        sentence: str,
        idempotency_key: str | None,
    ) -> tuple[dict, bool]:
        def perform() -> tuple[dict, int]:
            card = self.save(user_id, concept_id, learning, native, sentence)
            return card, card["id"]

        def replay(mnemonic_id: int) -> dict | None:
            mnemonic = self._mnemonics.get_for_user(user_id, mnemonic_id)
            return self._view(mnemonic) if mnemonic else None

        if self._idempotency is None:
            return perform()[0], False
        payload = {"concept_id": concept_id, "learning": learning, "native": native, "sentence": sentence}
        return self._idempotency.run(user_id, idempotency_key, SAVE_OPERATION, payload, perform, replay)

    def _draw(
        self, user_id: uuid.UUID, concept_id: int, learning: str, native: str, sentence: str
    ) -> tuple[str | None, str | None]:
        if not self._can_draw:
            return None, None
        if self._remaining(user_id) <= 0:
            raise RateLimited(f"You can create {self._settings.daily_limit} pictures a day. Come back tomorrow!")
        image = self._first_working_image(user_id, image_prompt(sentence))
        if image is None:
            return None, None
        try:
            path = image_path_for(user_id, concept_id, learning, native, image.media_type)
            self._store.save(path, image.data, image.media_type)
            return path, image.model
        except ExternalSourceError:
            logger.warning("picture could not be saved; falling back to the emoji", exc_info=True)
            return None, None

    def _first_working_image(self, user_id: uuid.UUID, prompt: str) -> GeneratedImage | None:
        for model in self._settings.image_models:
            try:
                image = self._images.generate_image(model, prompt, user=str(user_id))
            except UpstreamRateLimited:
                self._mnemonics.log_generation(user_id, model, succeeded=False)
                logger.warning("image models are rate limited; falling back to the emoji")
                return None
            except ExternalSourceError as exc:
                self._mnemonics.log_generation(user_id, model, succeeded=False)
                logger.warning("image model %s failed (%s); trying the next one", model, exc)
                continue
            self._mnemonics.log_generation(user_id, model, succeeded=True)
            return image
        logger.warning("no image model worked; falling back to the emoji")
        return None

    def _remaining(self, user_id: uuid.UUID) -> int:
        since = self._clock() - timedelta(days=1)
        return max(0, self._settings.daily_limit - self._mnemonics.count_generations_since(user_id, since))

    def _signed_urls(self, paths: list[str]) -> dict[str, str]:
        if not paths or self._store is None:
            return {}
        try:
            return self._store.signed_urls(paths, self._settings.signed_url_seconds)
        except ExternalSourceError:
            logger.warning("could not sign pictures", exc_info=True)
            return {}

    def _view(self, mnemonic: Mnemonic) -> dict:
        urls = self._signed_urls([mnemonic.image_path] if mnemonic.image_path else [])
        return mnemonic_view(mnemonic, urls.get(mnemonic.image_path or ""))
