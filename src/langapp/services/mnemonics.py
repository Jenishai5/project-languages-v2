from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from langapp.db.models import Concept, Mnemonic
from langapp.errors import ExternalSourceError, NotFound, RateLimited, ServiceUnavailable
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.services.languages import LANGUAGE_NAMES, LanguageCatalog
from langapp.services.ports import ChatModel, ImageModel, ImageStore

logger = logging.getLogger(__name__)

MAX_TEXT_LENGTH = 600
MAX_PROMPT_LENGTH = 400
IMAGE_STYLE = (
    "Handmade felt craft illustration with soft stitched edges, one clear subject, "
    "plain soft matcha green background, friendly and family-friendly. "
    "No text, no letters, no words in the image."
)
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class MnemonicIdea:
    text: str
    image_prompt: str


@dataclass(frozen=True)
class MnemonicSettings:
    text_model: str
    image_model: str
    daily_limit: int
    signed_url_seconds: int


def mnemonic_messages(word: str, translation: str, learning: str, native: str) -> list[dict]:
    learning_name = LANGUAGE_NAMES.get(learning, learning)
    native_name = LANGUAGE_NAMES.get(native, native)
    system = (
        "You are a creative language teacher who invents memory tricks with the keyword method: "
        f"link how a {learning_name} word sounds to its meaning with one vivid, funny, family-friendly scene. "
        "Answer only with JSON of the form "
        '{"mnemonic": "...", "image_prompt": "..."}. '
        f'"mnemonic": one or two short sentences written in {native_name}, quoting the {learning_name} word. '
        '"image_prompt": in English, describe only the scene to draw, with one main subject.'
    )
    user = f'Word to learn ({learning_name}): "{word}". Meaning ({native_name}): "{translation}".'
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def parse_idea(reply: str, word: str) -> MnemonicIdea:
    match = JSON_BLOCK.search(reply)
    if match:
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            data = {}
        text = str(data.get("mnemonic") or "").strip()
        prompt = str(data.get("image_prompt") or "").strip()
        if text:
            return MnemonicIdea(text[:MAX_TEXT_LENGTH], (prompt or f'A scene that shows "{word}"')[:MAX_PROMPT_LENGTH])
    text = reply.strip().strip("`").strip()
    return MnemonicIdea(text[:MAX_TEXT_LENGTH], f'A scene that shows "{word}"')


def image_prompt(idea: MnemonicIdea) -> str:
    return f"{idea.image_prompt} {IMAGE_STYLE}"


def image_path_for(user_id: uuid.UUID, concept_id: int, learning: str, native: str, media_type: str) -> str:
    return f"{user_id}/{concept_id}-{learning}-{native}.{EXTENSIONS.get(media_type, 'png')}"


def _term(concept: Concept, lang: str) -> str | None:
    return next((term.text for term in concept.terms if term.lang == lang), None)


def mnemonic_view(mnemonic: Mnemonic, image_url: str | None) -> dict:
    concept = mnemonic.concept
    return {
        "id": mnemonic.id,
        "concept_id": mnemonic.concept_id,
        "slug": concept.slug,
        "word": _term(concept, mnemonic.learning_lang) or concept.slug,
        "translation": _term(concept, mnemonic.native_lang) or "",
        "emoji": concept.emoji,
        "mnemonic": mnemonic.text,
        "image_url": image_url,
        "created_at": mnemonic.created_at,
    }


class MnemonicService:
    def __init__(
        self,
        mnemonics: MnemonicRepository,
        concepts: ConceptRepository,
        catalog: LanguageCatalog,
        chat: ChatModel | None,
        images: ImageModel | None,
        store: ImageStore | None,
        settings: MnemonicSettings,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._mnemonics = mnemonics
        self._concepts = concepts
        self._catalog = catalog
        self._chat = chat
        self._images = images
        self._store = store
        self._settings = settings
        self._clock = clock

    def list(self, user_id: uuid.UUID, learning: str, native: str) -> dict:
        self._catalog.ensure_pair(learning, native)
        items = self._mnemonics.list_for_user(user_id, learning, native)
        urls = self._signed_urls([m.image_path for m in items if m.image_path])
        return {
            "mnemonics": [mnemonic_view(m, urls.get(m.image_path or "")) for m in items],
            "daily_limit": self._settings.daily_limit,
            "remaining_today": self._remaining(user_id),
        }

    def create(self, user_id: uuid.UUID, concept_id: int, learning: str, native: str) -> dict:
        self._catalog.ensure_pair(learning, native)
        existing = self._mnemonics.find(user_id, concept_id, learning, native)
        if existing:
            return self._view(existing)
        if self._chat is None:
            raise ServiceUnavailable("AI is not configured: set OPENROUTER_API_KEY in .env")
        concept = self._concepts.get_with_terms(concept_id)
        if concept is None:
            raise NotFound(f"Word {concept_id} not found")
        word, translation = _term(concept, learning), _term(concept, native)
        if word is None or translation is None:
            raise NotFound("This word has no translation in your languages yet")
        if self._remaining(user_id) <= 0:
            raise RateLimited(f"You can create {self._settings.daily_limit} memory tricks a day. Come back tomorrow!")

        messages = mnemonic_messages(word, translation, learning, native)
        reply = self._chat.chat(self._settings.text_model, messages, user=str(user_id))
        idea = parse_idea(reply.text, word)
        image_path, image_model = self._make_image(user_id, concept_id, learning, native, idea)
        saved = self._mnemonics.add(user_id, concept_id, learning, native, idea.text, image_path, reply.model, image_model)
        return self._view(saved)

    def _make_image(
        self, user_id: uuid.UUID, concept_id: int, learning: str, native: str, idea: MnemonicIdea
    ) -> tuple[str | None, str | None]:
        if self._images is None or self._store is None:
            return None, None
        try:
            image = self._images.generate_image(self._settings.image_model, image_prompt(idea), user=str(user_id))
            path = image_path_for(user_id, concept_id, learning, native, image.media_type)
            self._store.save(path, image.data, image.media_type)
            return path, image.model
        except ExternalSourceError:
            logger.warning("mnemonic image failed; falling back to the emoji", exc_info=True)
            return None, None

    def _remaining(self, user_id: uuid.UUID) -> int:
        since = self._clock() - timedelta(days=1)
        return max(0, self._settings.daily_limit - self._mnemonics.count_created_since(user_id, since))

    def _signed_urls(self, paths: list[str]) -> dict[str, str]:
        if not paths or self._store is None:
            return {}
        try:
            return self._store.signed_urls(paths, self._settings.signed_url_seconds)
        except ExternalSourceError:
            logger.warning("could not sign mnemonic images", exc_info=True)
            return {}

    def _view(self, mnemonic: Mnemonic) -> dict:
        urls = self._signed_urls([mnemonic.image_path] if mnemonic.image_path else [])
        return mnemonic_view(mnemonic, urls.get(mnemonic.image_path or ""))
