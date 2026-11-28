from datetime import UTC, datetime, timedelta

from langapp.repositories.ai_usage import AiUsageRepository
from langapp.services.agent_activity import AgentActivity, agent_state
from langapp.services.usage_report import AGENT_NAMES

RECENT_LIMIT = 30


class LiveStatus:
    def __init__(self, activity: AgentActivity, usage: AiUsageRepository, blocked: dict[str, str]) -> None:
        self._activity = activity
        self._usage = usage
        self._blocked = blocked

    def view(self, now: datetime | None = None) -> dict:
        now = now or datetime.now(UTC)
        today = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        totals = {row["agent"]: row for row in self._usage.agent_totals_since(today)}
        snapshot = self._activity.snapshot()
        clock = self._activity.now()
        agents = []
        for name in AGENT_NAMES:
            snap = snapshot.get(name)
            state, detail = agent_state(snap, clock, self._blocked.get(name))
            total = totals.get(name)
            last = snap.last if snap else None
            agents.append(
                {
                    "agent": name,
                    "state": state,
                    "detail": detail,
                    "queued": snap.queued if snap else 0,
                    "running": len(snap.running_seconds) if snap else 0,
                    "running_ms": round(max(snap.running_seconds) * 1000) if snap and snap.running_seconds else None,
                    "average_ms": snap.average_ms if snap else None,
                    "last_finished_at": last.finished_wall if last else None,
                    "last_succeeded": last.succeeded if last else None,
                    "calls_today": total["calls"] if total else 0,
                    "failures_today": int(total["failures"]) if total else 0,
                    "last_call_at": total["last_call_at"] if total else None,
                }
            )
        recent = [
            {**row, "succeeded": bool(row["succeeded"])}
            for row in self._usage.recent_since(now - timedelta(days=7), RECENT_LIMIT)
        ]
        return {"generated_at": now, "tracking_since": self._activity.tracking_since, "agents": agents, "recent": recent}


def blocked_reasons(openrouter_ready: bool, azure_ready: bool) -> dict[str, str]:
    blocked = {}
    if not openrouter_ready:
        for name in ("grammar", "vocabulary", "conversation", "cultural"):
            blocked[name] = "Needs an OpenRouter API key"
    if not azure_ready:
        blocked["pronunciation"] = "Needs an Azure Speech key and region"
    return blocked
