import uuid
from dataclasses import dataclass
from datetime import datetime

from langapp.db.models import UserProgress
from langapp.domain import ItemType
from langapp.repositories.progress import ProgressRepository


@dataclass(frozen=True)
class ProgressSnapshot:
    key: str
    attempts: int
    correct: int
    mastery: int
    last_attempted_at: datetime
    next_review_at: datetime

    @classmethod
    def from_row(cls, row: UserProgress) -> "ProgressSnapshot":
        return cls(
            key=row.item_key,
            attempts=row.attempts,
            correct=row.correct_count,
            mastery=row.mastery_level,
            last_attempted_at=row.last_attempted_at,
            next_review_at=row.next_review_at,
        )


def word_key(language: str, lemma: str) -> str:
    return f"{language}:{lemma}"


class ProgressService:
    def __init__(self, repo: ProgressRepository) -> None:
        self._repo = repo

    def record(self, user_id: uuid.UUID, item_type: ItemType, key: str, correct: bool) -> ProgressSnapshot:
        return ProgressSnapshot.from_row(self._repo.record(user_id, item_type, key, correct))

    def for_user(self, user_id: uuid.UUID, item_type: ItemType) -> list[ProgressSnapshot]:
        return [ProgressSnapshot.from_row(row) for row in self._repo.for_user(user_id, item_type)]
