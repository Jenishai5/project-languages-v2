from collections.abc import Iterator, Sequence
from typing import Protocol

from langapp.domain import ChatReply, GeneratedImage, Page


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


class ImageModel(Protocol):
    def generate_image(self, model: str, prompt: str, user: str | None = None) -> GeneratedImage: ...


class ImageStore(Protocol):
    def save(self, path: str, data: bytes, content_type: str) -> str: ...

    def signed_urls(self, paths: list[str], expires_in: int) -> dict[str, str]: ...
