import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from langapp.db.models import AiUsage


class AiUsageRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def count_since(self, user_id: uuid.UUID, since: datetime) -> int:
        stmt = select(func.count()).select_from(AiUsage).where(AiUsage.user_id == user_id, AiUsage.created_at >= since)
        return self.session.scalar(stmt) or 0

    def log(self, user_id: uuid.UUID, agent: str, model: str, succeeded: bool, tokens: int | None = None) -> None:
        self.session.add(AiUsage(user_id=user_id, agent=agent, model=model, succeeded=succeeded, tokens=tokens))
        self.session.flush()
