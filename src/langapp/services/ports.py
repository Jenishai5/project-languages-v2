from collections.abc import Iterator, Sequence
from typing import Protocol

from langapp.domain import Page


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
