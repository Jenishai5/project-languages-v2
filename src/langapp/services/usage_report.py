from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from langapp.repositories.ai_usage import AiUsageRepository

AGENT_NAMES = ("grammar", "vocabulary", "conversation", "pronunciation", "cultural")


class UsageReport:
    def __init__(self, usage: AiUsageRepository) -> None:
        self.usage = usage

    def summary(self, days: int, now: datetime | None = None) -> dict:
        now = now or datetime.now(UTC)
        today = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        since = today - timedelta(days=days - 1)

        totals = {row["agent"]: row for row in self.usage.agent_totals_since(since)}
        daily: dict[str, dict[str, dict]] = defaultdict(dict)
        models: dict[str, Counter] = defaultdict(Counter)
        for row in self.usage.summary_since(since):
            day = row["day"].date().isoformat()
            entry = daily[row["agent"]].setdefault(day, {"day": day, "calls": 0, "failures": 0, "tokens": 0})
            entry["calls"] += row["calls"]
            entry["failures"] += int(row["failures"] or 0)
            entry["tokens"] += int(row["tokens"])
            models[row["agent"]][row["model"]] += row["calls"]

        return {
            "days": days,
            "generated_at": now,
            "agents": [self._agent(name, totals.get(name), daily[name], models[name]) for name in AGENT_NAMES],
        }

    @staticmethod
    def _agent(name: str, total: dict | None, daily: dict[str, dict], models: Counter) -> dict:
        calls = total["calls"] if total else 0
        failures = int(total["failures"]) if total else 0
        return {
            "agent": name,
            "calls": calls,
            "failures": failures,
            "failure_rate": round(failures / calls, 3) if calls else 0.0,
            "tokens": int(total["tokens"]) if total else 0,
            "learners": total["learners"] if total else 0,
            "models": [model for model, _ in models.most_common()],
            "last_call_at": total["last_call_at"] if total else None,
            "daily": [daily[day] for day in sorted(daily)],
        }
