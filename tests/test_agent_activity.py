from datetime import UTC, datetime

from langapp.services.agent_activity import AgentActivity, agent_state
from langapp.services.live_status import blocked_reasons


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def make() -> tuple[AgentActivity, FakeClock]:
    clock = FakeClock()
    return AgentActivity(clock=clock, wall=lambda: datetime(2026, 11, 26, 12, tzinfo=UTC)), clock


def state_of(activity: AgentActivity, agent: str, blocked: str | None = None) -> str:
    return agent_state(activity.snapshot().get(agent), activity.now(), blocked)[0]


def test_an_agent_with_nothing_to_do_is_idle():
    activity, _ = make()
    assert state_of(activity, "grammar") == "idle"


def test_a_queued_request_makes_the_agent_wait():
    activity, _ = make()
    activity.queued("grammar")
    assert state_of(activity, "grammar") == "waiting"


def test_a_running_call_is_thinking_then_working():
    activity, clock = make()
    ticket = activity.queued("grammar")
    activity.started(ticket)
    assert state_of(activity, "grammar") == "thinking"
    clock.now += 2
    assert state_of(activity, "grammar") == "working"


def test_a_finished_call_shows_success_briefly_then_idle():
    activity, clock = make()
    ticket = activity.queued("vocabulary")
    activity.started(ticket)
    clock.now += 0.8
    activity.finished(ticket, True, "model-a", 120)
    assert state_of(activity, "vocabulary") == "success"
    assert activity.snapshot()["vocabulary"].average_ms == 800
    clock.now += 7
    assert state_of(activity, "vocabulary") == "idle"


def test_a_failed_call_shows_the_error_with_its_reason():
    activity, clock = make()
    ticket = activity.queued("cultural")
    activity.started(ticket)
    activity.finished(ticket, False, reason="The AI provider is rate limiting")
    snap = activity.snapshot()["cultural"]
    assert agent_state(snap, activity.now(), None) == ("error", "The AI provider is rate limiting")
    clock.now += 21
    assert state_of(activity, "cultural") == "idle"


def test_a_cancelled_request_leaves_no_trace():
    activity, _ = make()
    activity.cancelled(activity.queued("grammar"))
    assert state_of(activity, "grammar") == "idle"


def test_missing_keys_block_the_agents_that_need_them():
    blocked = blocked_reasons(openrouter_ready=False, azure_ready=True)
    assert set(blocked) == {"grammar", "vocabulary", "conversation", "cultural"}
    assert blocked_reasons(openrouter_ready=True, azure_ready=False) == {"pronunciation": "Needs an Azure Speech key and region"}
    activity, _ = make()
    activity.queued("pronunciation")
    assert state_of(activity, "pronunciation", "Needs an Azure Speech key and region") == "blocked"
