import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from langapp.db.models import LearningOutcome


class LearningOutcomeRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(
        self,
        user_id: uuid.UUID,
        agent: str,
        kind: str,
        detail: dict,
        model: str | None = None,
        lesson_id: int | None = None,
        concept_id: int | None = None,
    ) -> LearningOutcome:
        outcome = LearningOutcome(
            user_id=user_id,
            agent=agent,
            kind=kind,
            detail=detail,
            model=model,
            lesson_id=lesson_id,
            concept_id=concept_id,
        )
        self.session.add(outcome)
        self.session.flush()
        return outcome

    def recent_for_user(self, user_id: uuid.UUID, limit: int = 20) -> list[LearningOutcome]:
        stmt = (
            select(LearningOutcome)
            .where(LearningOutcome.user_id == user_id)
            .order_by(LearningOutcome.created_at.desc(), LearningOutcome.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(stmt))
