import itertools
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

THINKING_SECONDS = 1.5
SUCCESS_SECONDS = 6.0
ERROR_SECONDS = 20.0


@dataclass
class Running:
    agent: str
    queued_at: float
    started_at: float | None = None


@dataclass(frozen=True)
class Finished:
    agent: str
    finished_at: float
    finished_wall: datetime
    ms: int
    succeeded: bool
    model: str | None
    tokens: int | None
    reason: str | None


@dataclass
class AgentSnapshot:
    queued: int = 0
    running_seconds: list[float] = field(default_factory=list)
    last: Finished | None = None
    average_ms: int | None = None


class AgentActivity:
    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        wall: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._clock = clock
        self._wall = wall
        self._lock = threading.Lock()
        self._ids = itertools.count(1)
        self._running: dict[int, Running] = {}
        self._last: dict[str, Finished] = {}
        self._durations: dict[str, deque[int]] = {}
        self.tracking_since = wall()

    def now(self) -> float:
        return self._clock()

    def queued(self, agent: str) -> int:
        with self._lock:
            ticket = next(self._ids)
            self._running[ticket] = Running(agent=agent, queued_at=self._clock())
            return ticket

    def started(self, ticket: int) -> None:
        with self._lock:
            entry = self._running.get(ticket)
            if entry is not None:
                entry.started_at = self._clock()

    def cancelled(self, ticket: int) -> None:
        with self._lock:
            self._running.pop(ticket, None)

    def finished(
        self,
        ticket: int,
        succeeded: bool,
        model: str | None = None,
        tokens: int | None = None,
        reason: str | None = None,
    ) -> None:
        with self._lock:
            entry = self._running.pop(ticket, None)
            if entry is None:
                return
            now = self._clock()
            ms = round((now - (entry.started_at or entry.queued_at)) * 1000)
            self._last[entry.agent] = Finished(entry.agent, now, self._wall(), ms, succeeded, model, tokens, reason)
            if succeeded:
                self._durations.setdefault(entry.agent, deque(maxlen=50)).append(ms)

    def snapshot(self) -> dict[str, AgentSnapshot]:
        with self._lock:
            now = self._clock()
            result: dict[str, AgentSnapshot] = {}
            for entry in self._running.values():
                snap = result.setdefault(entry.agent, AgentSnapshot())
                if entry.started_at is None:
                    snap.queued += 1
                else:
                    snap.running_seconds.append(now - entry.started_at)
            for agent, last in self._last.items():
                result.setdefault(agent, AgentSnapshot()).last = last
            for agent, durations in self._durations.items():
                if durations:
                    result.setdefault(agent, AgentSnapshot()).average_ms = round(sum(durations) / len(durations))
            return result


def agent_state(snapshot: AgentSnapshot | None, now: float, blocked_reason: str | None) -> tuple[str, str]:
    if blocked_reason:
        return "blocked", blocked_reason
    snap = snapshot or AgentSnapshot()
    if snap.running_seconds:
        longest = max(snap.running_seconds)
        count = len(snap.running_seconds)
        detail = f"Answering {count} learners" if count > 1 else "Answering a learner"
        return ("thinking" if longest < THINKING_SECONDS else "working"), detail
    if snap.queued:
        return "waiting", f"{snap.queued} request{'s' if snap.queued > 1 else ''} waiting for a free slot"
    last = snap.last
    if last is not None:
        age = now - last.finished_at
        if last.succeeded and age < SUCCESS_SECONDS:
            return "success", "Just sent an answer"
        if not last.succeeded and age < ERROR_SECONDS:
            return "error", last.reason or "The last answer failed"
    return "idle", "Ready for the next learner"
