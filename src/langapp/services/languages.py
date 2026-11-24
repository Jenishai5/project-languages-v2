from langapp.errors import InvalidRequest
from langapp.repositories.concepts import ConceptRepository

LANGUAGE_NAMES = {"eng": "English", "spa": "Spanish", "rus": "Russian", "cat": "Catalan"}


class LanguageNotSupported(InvalidRequest):
    pass


def language_list(counts: dict[str, int]) -> list[dict]:
    return [
        {"code": code, "name": LANGUAGE_NAMES.get(code, code), "words": count}
        for code, count in sorted(counts.items(), key=lambda item: -item[1])
    ]


def check_languages(learning: str, native: str, available: set[str]) -> None:
    if learning == native:
        raise LanguageNotSupported("Native and learning language must be different.")
    for code in (learning, native):
        if code not in available:
            raise LanguageNotSupported(f"Language '{code}' is not available yet.")


class LanguageCatalog:
    def __init__(self, concepts: ConceptRepository) -> None:
        self._concepts = concepts

    def list(self) -> list[dict]:
        return language_list(self._concepts.languages())

    def ensure_pair(self, learning: str, native: str) -> None:
        check_languages(learning, native, set(self._concepts.languages()))
