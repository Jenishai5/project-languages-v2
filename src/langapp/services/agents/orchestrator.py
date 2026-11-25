import hashlib
import logging
import threading
import uuid
from collections import Counter, OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from langapp.errors import ExternalSourceError, InvalidRequest, NotFound, RateLimited, ServiceUnavailable, UpstreamRateLimited
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.base import DEFAULT_LEVEL, LearnerContext
from langapp.services.agents.cultural import AGENT as CULTURAL
from langapp.services.agents.cultural import CulturalAgent, CultureNote
from langapp.services.agents.grammar import AGENT as GRAMMAR
from langapp.services.agents.grammar import GrammarAgent, GrammarFeedback
from langapp.services.agents.vocabulary import AGENT as VOCABULARY
from langapp.services.agents.vocabulary import VocabularyAgent, WordHelp
from langapp.services.games import tokenize
from langapp.services.lessons import word_cards

logger = logging.getLogger(__name__)


class ReplyCache:
    def __init__(self, max_items: int = 500) -> None:
        self._items: OrderedDict[str, Any] = OrderedDict()
        self._max_items = max_items
        self._lock = threading.Lock()

    def get(self, key: str) -> Any:
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
            return value

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self._max_items:
                self._items.popitem(last=False)


@dataclass(frozen=True)
class AgentLimits:
    daily_limit: int = 30
    wait_seconds: float = 5.0


@dataclass(frozen=True)
class Answer:
    value: Any = None
    cached: bool = False
    message: str | None = None


def same_words(answer: list[str], target: list[str]) -> bool:
    return Counter(w.casefold() for w in answer) == Counter(w.casefold() for w in target)


def cache_key(*parts: str) -> str:
    return hashlib.sha256("␟".join(parts).encode("utf-8")).hexdigest()


def start_of_day(now: datetime) -> datetime:
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


class AgentOrchestrator:
    def __init__(
        self,
        sentences: SentenceRepository,
        concepts: ConceptRepository,
        user_settings: UserSettingsRepository,
        outcomes: LearningOutcomeRepository,
        usage: AiUsageRepository,
        grammar: GrammarAgent | None,
        vocabulary: VocabularyAgent | None,
        cache: ReplyCache,
        gate: threading.Semaphore,
        limits: AgentLimits | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        cultural: CulturalAgent | None = None,
    ) -> None:
        self._sentences = sentences
        self._concepts = concepts
        self._user_settings = user_settings
        self._outcomes = outcomes
        self._usage = usage
        self._grammar = grammar
        self._vocabulary = vocabulary
        self._cultural = cultural
        self._cache = cache
        self._gate = gate
        self._limits = limits or AgentLimits()
        self._clock = clock

    def learner(self, user_id: uuid.UUID, learning: str, native: str) -> LearnerContext:
        row = self._user_settings.get_settings(user_id)
        level = row.level if row is not None and row.level else DEFAULT_LEVEL
        return LearnerContext(user_id=user_id, learning=learning, native=native, level=level)

    def remaining_today(self, user_id: uuid.UUID) -> int:
        used = self._usage.count_since(user_id, start_of_day(self._clock()))
        return max(0, self._limits.daily_limit - used)

    def check_shuffle(self, user_id: uuid.UUID, sentence_id: int, answer: list[str], learning: str, native: str) -> dict:
        sentence = self._sentences.get(sentence_id)
        if sentence is None or sentence.lang != learning:
            raise NotFound("Sentence not found.")

        target_words = [token.form for token in tokenize(sentence.text)]
        answer_words = [word.strip() for word in answer]
        if not same_words(answer_words, target_words):
            raise InvalidRequest("Use exactly the word tiles of this sentence.")
        if [w.casefold() for w in answer_words] == [w.casefold() for w in target_words]:
            return self._grammar_view(user_id, correct=True, answer=Answer())

        context = self.learner(user_id, learning, native)
        target, attempt = " ".join(target_words), " ".join(answer_words)
        result = self.ask(
            context,
            GRAMMAR,
            self._grammar,
            cache_key(GRAMMAR, target, attempt, native, context.level),
            lambda agent: agent.explain(context, target, attempt, self._meaning(sentence_id, native)),
            lambda feedback: bool(feedback.explanation),
        )
        if isinstance(result.value, GrammarFeedback):
            detail = {"sentence_id": sentence_id, "target": target, "answer": attempt, "mistakes": result.value.mistakes_view()}
            self._outcomes.add(user_id, agent=GRAMMAR, kind="mistake", model=result.value.model, detail=detail)
        return self._grammar_view(user_id, correct=False, answer=result)

    def _card(self, concept_id: int, learning: str, native: str) -> dict:
        concept = self._concepts.get_with_terms(concept_id)
        cards = word_cards([concept], learning, native) if concept is not None else []
        if not cards:
            raise NotFound("Word not found.")
        return cards[0]

    def culture_note(self, user_id: uuid.UUID, concept_id: int, learning: str, native: str) -> dict:
        card = self._card(concept_id, learning, native)
        context = self.learner(user_id, learning, native)
        result = self.ask(
            context,
            CULTURAL,
            self._cultural,
            cache_key(CULTURAL, card["word"], card["translation"], learning, native, context.level),
            lambda agent: agent.explain(context, card["word"], card["translation"]),
            lambda note: bool(note.note),
        )
        note = result.value if isinstance(result.value, CultureNote) else None
        if note is not None:
            detail = {"slug": card["slug"]}
            self._outcomes.add(
                user_id, agent=CULTURAL, kind="culture_note", concept_id=concept_id, model=note.model, detail=detail
            )
        view = note.view() if note else {"note": None, "expressions": [], "fun_fact": None}
        return {
            "concept_id": concept_id,
            "word": card["word"],
            "translation": card["translation"],
            "available": note is not None,
            **view,
            "cached": result.cached,
            "message": result.message,
            "remaining_today": self.remaining_today(user_id),
        }

    def word_help(self, user_id: uuid.UUID, concept_id: int, learning: str, native: str) -> dict:
        card = self._card(concept_id, learning, native)

        context = self.learner(user_id, learning, native)
        result = self.ask(
            context,
            VOCABULARY,
            self._vocabulary,
            cache_key(VOCABULARY, card["word"], card["translation"], learning, native, context.level),
            lambda agent: agent.help(context, card["word"], card["translation"]),
            lambda help_: help_.useful,
        )
        if isinstance(result.value, WordHelp):
            self._outcomes.add(
                user_id,
                agent=VOCABULARY,
                kind="word_help",
                concept_id=concept_id,
                model=result.value.model,
                detail={"slug": card["slug"]},
            )
        view = result.value.view() if isinstance(result.value, WordHelp) else WordHelp().view()
        return {
            "concept_id": concept_id,
            "word": card["word"],
            "translation": card["translation"],
            "available": isinstance(result.value, WordHelp),
            **view,
            "cached": result.cached,
            "message": result.message,
            "remaining_today": self.remaining_today(user_id),
        }

    def ask(
        self,
        context: LearnerContext,
        name: str,
        agent: Any,
        key: str | None,
        call: Callable[[Any], Any],
        usable: Callable[[Any], bool],
    ) -> Answer:
        cached = self._cache.get(key) if key else None
        if cached is not None:
            return Answer(value=cached, cached=True)
        if agent is None:
            return Answer(message="AI help is not set up on this server yet.")
        if self.remaining_today(context.user_id) <= 0:
            raise RateLimited(f"You have used today's {self._limits.daily_limit} AI answers. Come back tomorrow.")
        if not self._gate.acquire(timeout=self._limits.wait_seconds):
            raise ServiceUnavailable("Many learners are asking right now. Try again in a moment.")
        try:
            value = call(agent)
        except UpstreamRateLimited:
            raise
        except ExternalSourceError as exc:
            logger.warning("%s agent failed: %s", name, exc)
            self._usage.log(context.user_id, name, agent.primary_model, succeeded=False)
            return Answer(message=f"The AI teacher could not answer this time ({exc}). Try again later.")
        finally:
            self._gate.release()

        self._usage.log(context.user_id, name, value.model or agent.primary_model, True, value.tokens)
        if not usable(value):
            return Answer(message="The AI teacher sent an empty answer. Try again later.")
        if key:
            self._cache.put(key, value)
        return Answer(value=value)

    def _meaning(self, sentence_id: int, native: str) -> str | None:
        found = self._sentences.translations_for([sentence_id], [native]).get(sentence_id, {}).get(native) or []
        return found[0] if found else None

    def _grammar_view(self, user_id: uuid.UUID, correct: bool, answer: Answer) -> dict:
        feedback = answer.value if isinstance(answer.value, GrammarFeedback) else None
        return {
            "correct": correct,
            "available": feedback is not None,
            "explanation": feedback.explanation if feedback else None,
            "mistakes": feedback.mistakes_view() if feedback else [],
            "tip": feedback.tip if feedback else None,
            "cached": answer.cached,
            "message": answer.message,
            "remaining_today": self.remaining_today(user_id),
        }
