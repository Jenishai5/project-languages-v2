import hashlib
import logging
import threading
import uuid
from collections import Counter, OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from langapp.errors import ExternalSourceError, InvalidRequest, NotFound, RateLimited, ServiceUnavailable, UpstreamRateLimited
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.base import DEFAULT_LEVEL, LearnerContext
from langapp.services.agents.grammar import AGENT as GRAMMAR
from langapp.services.agents.grammar import GrammarAgent, GrammarFeedback
from langapp.services.games import tokenize

logger = logging.getLogger(__name__)


class ReplyCache:
    def __init__(self, max_items: int = 500) -> None:
        self._items: OrderedDict[str, GrammarFeedback] = OrderedDict()
        self._max_items = max_items
        self._lock = threading.Lock()

    def get(self, key: str) -> GrammarFeedback | None:
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
            return value

    def put(self, key: str, value: GrammarFeedback) -> None:
        with self._lock:
            self._items[key] = value
            self._items.move_to_end(key)
            while len(self._items) > self._max_items:
                self._items.popitem(last=False)


@dataclass(frozen=True)
class AgentLimits:
    daily_limit: int = 30
    wait_seconds: float = 5.0


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
        user_settings: UserSettingsRepository,
        outcomes: LearningOutcomeRepository,
        usage: AiUsageRepository,
        grammar: GrammarAgent | None,
        cache: ReplyCache,
        gate: threading.Semaphore,
        limits: AgentLimits | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._sentences = sentences
        self._user_settings = user_settings
        self._outcomes = outcomes
        self._usage = usage
        self._grammar = grammar
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
            return self._view(user_id, correct=True)

        context = self.learner(user_id, learning, native)
        target, attempt = " ".join(target_words), " ".join(answer_words)
        key = cache_key(GRAMMAR, target, attempt, native, context.level)

        cached = self._cache.get(key)
        if cached is not None:
            self._record(context, sentence_id, target, attempt, cached)
            return self._view(user_id, correct=False, feedback=cached, cached=True)

        if self._grammar is None:
            return self._view(user_id, correct=False, message="AI explanations are not set up on this server yet.")
        if self.remaining_today(user_id) <= 0:
            raise RateLimited(f"You have used today's {self._limits.daily_limit} AI explanations. Come back tomorrow.")

        meaning = self._meaning(sentence_id, native)
        if not self._gate.acquire(timeout=self._limits.wait_seconds):
            raise ServiceUnavailable("Many learners are asking right now. Try again in a moment.")
        try:
            feedback = self._grammar.explain(context, target, attempt, meaning)
        except UpstreamRateLimited:
            raise
        except ExternalSourceError as exc:
            logger.warning("Grammar agent failed: %s", exc)
            self._usage.log(user_id, GRAMMAR, self._grammar.primary_model, succeeded=False)
            message = f"The AI teacher could not answer this time ({exc}). Try again later."
            return self._view(user_id, correct=False, message=message)
        finally:
            self._gate.release()

        self._usage.log(user_id, GRAMMAR, feedback.model or self._grammar.primary_model, True, feedback.tokens)
        if not feedback.explanation:
            return self._view(user_id, correct=False, message="The AI teacher sent an empty answer. Try again later.")
        self._cache.put(key, feedback)
        self._record(context, sentence_id, target, attempt, feedback)
        return self._view(user_id, correct=False, feedback=feedback)

    def _meaning(self, sentence_id: int, native: str) -> str | None:
        found = self._sentences.translations_for([sentence_id], [native]).get(sentence_id, {}).get(native) or []
        return found[0] if found else None

    def _record(self, context: LearnerContext, sentence_id: int, target: str, attempt: str, feedback: GrammarFeedback) -> None:
        self._outcomes.add(
            context.user_id,
            agent=GRAMMAR,
            kind="mistake",
            model=feedback.model,
            detail={"sentence_id": sentence_id, "target": target, "answer": attempt, "mistakes": feedback.mistakes_view()},
        )

    def _view(
        self,
        user_id: uuid.UUID,
        correct: bool,
        feedback: GrammarFeedback | None = None,
        cached: bool = False,
        message: str | None = None,
    ) -> dict:
        return {
            "correct": correct,
            "available": feedback is not None,
            "explanation": feedback.explanation if feedback else None,
            "mistakes": feedback.mistakes_view() if feedback else [],
            "tip": feedback.tip if feedback else None,
            "cached": cached,
            "message": message,
            "remaining_today": self.remaining_today(user_id),
        }
