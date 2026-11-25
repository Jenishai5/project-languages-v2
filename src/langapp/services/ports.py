from collections.abc import Iterator, Sequence
from typing import Protocol

from langapp.domain import ChatReply, GeneratedImage, Page, PronunciationScore


class SentencePageSource(Protocol):
    def iter_sentence_pages(
        self,
        source_lang: str,
        target_langs: Sequence[str] = (),
        max_pages: int | None = None,
        page_size: int = ...,
        max_words: int | None = None,
        with_audio: bool = False,
    ) -> Iterator[Page]: ...


class SentenceSearch(Protocol):
    def search_sentences(
        self,
        lang: str,
        query: str,
        target_langs: Sequence[str],
        min_words: int = 3,
        max_words: int = 7,
        limit: int = 20,
    ) -> dict: ...


class ChatModel(Protocol):
    def chat(self, model: str, messages: list[dict], user: str | None = None) -> ChatReply: ...


class JsonChatModel(Protocol):
    def chat_json(
        self, models: Sequence[str], messages: list[dict], user: str | None = None, max_tokens: int = 400
    ) -> ChatReply: ...


class ImageModel(Protocol):
    def generate_image(self, model: str, prompt: str, user: str | None = None) -> GeneratedImage: ...


class ImageStore(Protocol):
    def save(self, path: str, data: bytes, content_type: str) -> str: ...

    def signed_urls(self, paths: list[str], expires_in: int) -> dict[str, str]: ...


class PronunciationScorer(Protocol):
    def assess(self, audio: bytes, reference_text: str, locale: str) -> PronunciationScore | None: ...
