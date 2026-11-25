import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from langapp.errors import InvalidRequest
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.progress import ProgressRepository
from langapp.services.learner import LearnerService
from langapp.services.lessons import word_cards


def _user(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError as exc:
        raise InvalidRequest("user_id must be a UUID.") from exc


class Insights:
    def __init__(self, factory: sessionmaker[Session]) -> None:
        self._factory = factory

    def _read(self) -> Session:
        session = self._factory()
        session.execute(text("SET TRANSACTION READ ONLY"))
        return session

    def lessons(self, learning: str, native: str) -> list[dict]:
        with self._read() as session:
            return LessonRepository(session).list_lessons(learning, native)

    def lesson_words(self, lesson_id: int, learning: str, native: str) -> list[dict]:
        with self._read() as session:
            return word_cards(LessonRepository(session).lesson_concepts(lesson_id), learning, native)

    def weak_words(self, user_id: str, learning: str, native: str, limit: int = 5) -> list[dict]:
        with self._read() as session:
            learner = LearnerService(ProgressRepository(session), ConceptRepository(session), LessonRepository(session))
            return learner.weak_words(_user(user_id), learning, native, limit=min(max(limit, 1), 20))

    def recent_outcomes(self, user_id: str, limit: int = 20) -> list[dict]:
        with self._read() as session:
            rows = LearningOutcomeRepository(session).recent_for_user(_user(user_id), limit=min(max(limit, 1), 100))
            return [
                {
                    "agent": row.agent,
                    "kind": row.kind,
                    "concept_id": row.concept_id,
                    "detail": row.detail,
                    "model": row.model,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]

    def ai_usage(self, days: int = 7, now: datetime | None = None) -> list[dict]:
        since = (now or datetime.now(UTC)) - timedelta(days=min(max(days, 1), 90))
        with self._read() as session:
            return [
                {**row, "day": row["day"].date().isoformat(), "failures": int(row["failures"] or 0), "tokens": int(row["tokens"])}
                for row in AiUsageRepository(session).summary_since(since)
            ]
