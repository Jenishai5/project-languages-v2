import logging
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session, sessionmaker

from langapp.domain import ParsedSentence
from langapp.errors import ExternalSourceError
from langapp.ingestion.concepts import ARTICLES, WORDS_PER_LESSON, build_concepts, core_word, plan_lessons
from langapp.ingestion.dictionary_parser import load_dictionary_file, pair_from_file_name
from langapp.ingestion.parser import parse_page
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.lessons import LessonRepository, LessonWord
from langapp.repositories.sentences import SentenceRepository
from langapp.services.ports import SentenceSearch
from langapp.services.word_tagger import ADVERBS, CONJUNCTIONS, PREPOSITIONS, PRONOUNS, VERBS
from langapp.services.word_tagger import ARTICLES as ARTICLE_WORDS

logger = logging.getLogger(__name__)

WORD_PATTERN = re.compile(r"[\w']+", re.UNICODE)
BASIC_WORDS = PRONOUNS | ARTICLE_WORDS | PREPOSITIONS | CONJUNCTIONS | VERBS | ADVERBS | {
    "yes", "no", "please", "thanks", "hello", "here", "is", "tom", "mary",
}


@dataclass
class ConceptImportSummary:
    concepts: int
    lessons: int


@dataclass
class LessonBuildSummary:
    words: int = 0
    words_with_sentences: int = 0
    sentences_linked: int = 0
    missed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


def import_concepts(
    paths: Sequence[Path],
    session_factory: sessionmaker[Session],
    words_per_lesson: int = WORDS_PER_LESSON,
) -> ConceptImportSummary:
    pairs_by_file = {pair_from_file_name(path): load_dictionary_file(path)[0] for path in paths}
    concepts = build_concepts(pairs_by_file)
    lessons = plan_lessons(concepts, words_per_lesson)
    with session_factory.begin() as session:
        ids = ConceptRepository(session).upsert_concepts(concepts)
        count = LessonRepository(session).upsert_lessons(lessons, ids)
    return ConceptImportSummary(concepts=len(ids), lessons=count)


def search_query(term: str, lang: str) -> str:
    word = core_word(term, lang)
    return f'"{word}"' if " " in word else f"={word}"


def words_of(text: str) -> list[str]:
    return [w.lower().removesuffix("'s") for w in WORD_PATTERN.findall(text)]


def known_vocabulary(terms: Iterable[str], lang: str) -> set[str]:
    known = set(BASIC_WORDS) if lang == "eng" else set()
    for term in terms:
        for alternative in term.split("/"):
            known.update(words_of(core_word(alternative, lang)))
        for article in ARTICLES.get(lang, ()):
            known.update(words_of(article))
    return known


def contains_word(text: str, word: str) -> bool:
    return re.search(rf"(?<![\w']){re.escape(word)}(?![\w'])", text, re.IGNORECASE | re.UNICODE) is not None


def coverage(text: str, known: set[str]) -> float:
    tokens = words_of(text)
    return sum(token in known for token in tokens) / len(tokens) if tokens else 0.0


def rank_candidates(
    sentences: Sequence[ParsedSentence], word: str, known: set[str], natives: Sequence[str], min_coverage: float
) -> list[ParsedSentence]:
    scored = []
    for sentence in sentences:
        if not contains_word(sentence.text, word):
            continue
        if not any(t.lang in natives for t in sentence.translations):
            continue
        score = coverage(sentence.text, known | {word})
        if score < min_coverage:
            continue
        scored.append((score, bool(sentence.audios), -sentence.word_count, sentence))
    scored.sort(key=lambda item: item[:3], reverse=True)
    return [item[3] for item in scored]


class LessonSentenceBuilder:
    def __init__(
        self,
        client: SentenceSearch,
        session_factory: sessionmaker[Session],
        per_word: int = 2,
        min_coverage: float = 0.6,
    ) -> None:
        self._client = client
        self._session_factory = session_factory
        self._per_word = per_word
        self._min_coverage = min_coverage

    def build(self, learning_lang: str, natives: Sequence[str], first_lessons: int | None) -> LessonBuildSummary:
        with self._session_factory() as session:
            words = LessonRepository(session).words_to_fill(learning_lang, first_lessons)
            known = known_vocabulary(ConceptRepository(session).all_terms(learning_lang), learning_lang)

        summary = LessonBuildSummary(words=len(words))
        for word in words:
            try:
                linked = self._fill_word(word, learning_lang, natives, known)
            except ExternalSourceError as exc:
                logger.warning("%s: %s", word.slug, exc)
                summary.failed.append(word.slug)
                continue
            if linked:
                summary.words_with_sentences += 1
                summary.sentences_linked += linked
            else:
                summary.missed.append(word.slug)
        return summary

    def _fill_word(self, word: LessonWord, learning_lang: str, natives: Sequence[str], known: set[str]) -> int:
        payload = self._client.search_sentences(learning_lang, search_query(word.term, learning_lang), natives)
        result = parse_page(payload)
        target = core_word(word.term, learning_lang)
        chosen: dict[int, ParsedSentence] = {}
        for native in natives:
            for sentence in rank_candidates(result.sentences, target, known, [native], self._min_coverage)[: self._per_word]:
                chosen.setdefault(sentence.id, sentence)
        chosen = list(chosen.values())
        if not chosen:
            return 0
        with self._session_factory.begin() as session:
            SentenceRepository(session).upsert_many(chosen)
            return LessonRepository(session).add_lesson_sentences(
                [(word.lesson_id, sentence.id, word.concept_id) for sentence in chosen]
            )
