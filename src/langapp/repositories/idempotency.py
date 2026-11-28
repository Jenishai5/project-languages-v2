import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from langapp.db.models import IdempotencyKey


class IdempotencyRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def claim(
        self, user_id: uuid.UUID, key: str, operation: str, fingerprint: str, expired_before: datetime
    ) -> IdempotencyKey | None:
        self.session.execute(
            delete(IdempotencyKey).where(
                IdempotencyKey.user_id == user_id,
                IdempotencyKey.key == key,
                IdempotencyKey.created_at < expired_before,
            )
        )
        claimed = self.session.execute(
            insert(IdempotencyKey)
            .values(user_id=user_id, key=key, operation=operation, fingerprint=fingerprint)
            .on_conflict_do_nothing(index_elements=["user_id", "key"])
            .returning(IdempotencyKey.key)
        ).first()
        if claimed:
            return None
        stmt = select(IdempotencyKey).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
        return self.session.scalars(stmt.execution_options(populate_existing=True)).one()

    def finish(self, user_id: uuid.UUID, key: str, result_id: int) -> None:
        self.session.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
            .values(result_id=result_id)
        )
