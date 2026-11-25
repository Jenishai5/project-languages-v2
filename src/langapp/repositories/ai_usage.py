import uuid
from datetime import datetime

from sqlalchemy import Integer, cast, func, select
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

    def by_agent_since(self, user_id: uuid.UUID, since: datetime) -> dict[str, int]:
        stmt = (
            select(AiUsage.agent, func.count())
            .where(AiUsage.user_id == user_id, AiUsage.created_at >= since)
            .group_by(AiUsage.agent)
        )
        return {agent: count for agent, count in self.session.execute(stmt)}

    def summary_since(self, since: datetime) -> list[dict]:
        day = func.date_trunc("day", func.timezone("UTC", AiUsage.created_at))
        stmt = (
            select(
                day.label("day"),
                AiUsage.agent,
                AiUsage.model,
                func.count().label("calls"),
                func.sum(cast(~AiUsage.succeeded, Integer)).label("failures"),
                func.coalesce(func.sum(AiUsage.tokens), 0).label("tokens"),
                func.count(func.distinct(AiUsage.user_id)).label("learners"),
            )
            .where(AiUsage.created_at >= since)
            .group_by(day, AiUsage.agent, AiUsage.model)
            .order_by(day.desc(), AiUsage.agent, AiUsage.model)
        )
        return [dict(row._mapping) for row in self.session.execute(stmt)]
