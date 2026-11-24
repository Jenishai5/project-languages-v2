import uuid

from sqlalchemy import Integer, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from langapp.db.models import UserProgress
from langapp.domain import ItemType

MAX_MASTERY = 5


def _days_until_review(mastery):
    return func.make_interval(0, 0, 0, func.power(2, mastery).cast(Integer))


class ProgressRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record(self, user_id: uuid.UUID, item_type: ItemType, item_key: str, correct: bool) -> UserProgress:
        step = 1 if correct else -1
        first_mastery = 1 if correct else 0
        new_mastery = func.least(MAX_MASTERY, func.greatest(0, UserProgress.mastery_level + step))

        stmt = insert(UserProgress).values(
            user_id=user_id,
            item_type=item_type,
            item_key=item_key,
            attempts=1,
            correct_count=1 if correct else 0,
            mastery_level=first_mastery,
            last_attempted_at=func.now(),
            next_review_at=func.now() + _days_until_review(first_mastery),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[UserProgress.user_id, UserProgress.item_type, UserProgress.item_key],
            set_={
                "attempts": UserProgress.attempts + 1,
                "correct_count": UserProgress.correct_count + (1 if correct else 0),
                "mastery_level": new_mastery,
                "last_attempted_at": func.now(),
                "next_review_at": func.now() + _days_until_review(new_mastery),
            },
        ).returning(UserProgress)
        return self.session.scalars(stmt).one()

    def for_user(self, user_id: uuid.UUID, item_type: ItemType) -> list[UserProgress]:
        stmt = (
            select(UserProgress)
            .where(UserProgress.user_id == user_id, UserProgress.item_type == item_type)
            .order_by(UserProgress.last_attempted_at.desc())
        )
        return list(self.session.scalars(stmt))
