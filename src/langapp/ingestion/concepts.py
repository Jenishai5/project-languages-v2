import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field

from langapp.domain import ParsedWordPair

ARTICLES = {
    "eng": ("the ", "an ", "a "),
    "spa": ("el ", "la ", "los ", "las ", "un ", "una ", "unos ", "unas ", "l'"),
}
LANG_OF = {"en": "eng", "es": "spa", "ru": "rus"}
MIN_LAST_LESSON = 3


@dataclass
class ParsedConcept:
    slug: str
    category: str
    terms: dict[str, str] = field(default_factory=dict)
    emoji: str | None = None


@dataclass(frozen=True)
class PlannedLesson:
    slug: str
    title: str
    position: int
    concept_slugs: tuple[str, ...]


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def normalize_category(raw: str) -> str:
    name = re.sub(r"^const(?=[A-Z])", "", raw)
    name = re.sub(r"(?<=[a-z])(?=[A-Z])", "_", name)
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def core_word(text: str, lang: str) -> str:
    lowered = text.split("/")[0].strip().lower()
    for article in ARTICLES.get(lang, ()):
        if lowered.startswith(article):
            return lowered[len(article):].strip()
    return lowered


def _by_source(pairs: list[ParsedWordPair], lang: str) -> dict[str, ParsedWordPair]:
    result: dict[str, ParsedWordPair] = {}
    for pair in pairs:
        result.setdefault(core_word(pair.source_text, lang), pair)
    return result


def build_concepts(pairs_by_file: Mapping[str, list[ParsedWordPair]]) -> list[ParsedConcept]:
    english_spanish = pairs_by_file.get("en-es", [])
    english_russian = _by_source(pairs_by_file.get("en-ru", []), "eng")
    spanish_russian = _by_source(pairs_by_file.get("es-ru", []), "spa")
    spanish_emoji = _by_source(pairs_by_file.get("es-emojis", []), "spa")

    concepts: list[ParsedConcept] = []
    slugs: set[str] = set()
    seen_english: set[str] = set()

    def add(english: str, category: str, terms: dict[str, str]) -> None:
        slug = slugify(english)
        if slug in slugs:
            slug = f"{slug}-{slugify(normalize_category(category))}"
        if not slug or slug in slugs:
            return
        slugs.add(slug)
        spanish = terms.get("spa")
        if "rus" not in terms and spanish and core_word(spanish, "spa") in spanish_russian:
            terms["rus"] = spanish_russian[core_word(spanish, "spa")].target_text
        emoji_pair = spanish_emoji.get(core_word(spanish, "spa")) if spanish else None
        concepts.append(
            ParsedConcept(
                slug=slug,
                category=normalize_category(category),
                terms=terms,
                emoji=emoji_pair.target_text if emoji_pair else None,
            )
        )

    for pair in english_spanish:
        english = core_word(pair.source_text, "eng")
        terms = {"eng": pair.source_text, "spa": pair.target_text}
        russian = english_russian.get(english)
        if russian:
            terms["rus"] = russian.target_text
        add(english, pair.category or "general", terms)
        seen_english.add(english)

    for english, pair in english_russian.items():
        if english not in seen_english:
            add(english, pair.category or "general", {"eng": pair.source_text, "rus": pair.target_text})

    return concepts


def plan_lessons(concepts: list[ParsedConcept], words_per_lesson: int = 5) -> list[PlannedLesson]:
    by_category: dict[str, list[str]] = {}
    for concept in concepts:
        by_category.setdefault(concept.category, []).append(concept.slug)

    lessons: list[PlannedLesson] = []
    for category, slugs in by_category.items():
        title = category.replace("_", " ").capitalize()
        chunks = [slugs[start:start + words_per_lesson] for start in range(0, len(slugs), words_per_lesson)]
        if len(chunks) > 1 and len(chunks[-1]) < MIN_LAST_LESSON:
            chunks[-2].extend(chunks.pop())
        for number, chunk in enumerate(chunks, start=1):
            lessons.append(
                PlannedLesson(
                    slug=f"{category.replace('_', '-')}-{number}",
                    title=f"{title} {number}",
                    position=len(lessons) + 1,
                    concept_slugs=tuple(chunk),
                )
            )
    return lessons


def language_of_pair(pair: str) -> tuple[str, str]:
    source, target = pair.split("-", 1)
    return LANG_OF.get(source, source), LANG_OF.get(target, target)
