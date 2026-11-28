from langapp.api import deps
from langapp.config import get_settings
from langapp.services.agent_activity import AgentActivity
from langapp.services.usage_report import AGENT_NAMES
from tests.test_usage_summary import AUTH, admins, api, contract_validator, seed_usage  # noqa: F401


def settings_with(**update):
    settings = get_settings().model_copy(update={"admin_emails": "jeni@example.com", **update})
    return lambda: settings


def test_live_shows_a_running_call_and_a_missing_key(api, session_factory, monkeypatch):  # noqa: F811
    seed_usage(session_factory)
    activity = AgentActivity()
    activity.started(activity.queued("grammar"))
    api.app.dependency_overrides[deps.get_agent_activity] = lambda: activity
    monkeypatch.setattr(deps, "get_settings", settings_with(openrouter_api_key="key", azure_speech_key=None))

    response = api.get("/agents/live", headers=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert sorted(contract_validator("AgentsLive").iter_errors(body), key=str) == []
    agents = {a["agent"]: a for a in body["agents"]}
    assert [a["agent"] for a in body["agents"]] == list(AGENT_NAMES)
    assert agents["grammar"]["state"] == "thinking" and agents["grammar"]["running"] == 1
    assert agents["grammar"]["calls_today"] == 2 and agents["grammar"]["failures_today"] == 1
    assert agents["pronunciation"]["state"] == "blocked"
    assert agents["vocabulary"]["state"] == "idle"
    assert len(body["recent"]) == 4 and body["recent"][0]["agent"] in AGENT_NAMES


def test_live_is_only_for_admins(api, monkeypatch):  # noqa: F811
    monkeypatch.setattr(deps, "get_settings", admins("boss@x.org"))
    assert api.get("/agents/live", headers=AUTH).status_code == 403
    assert api.get("/agents/live").status_code == 401
