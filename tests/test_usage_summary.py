from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from langapp.api import deps
from langapp.api.deps import get_session, get_token_verifier
from langapp.api.main import app
from langapp.db.models import AiUsage
from langapp.services.usage_report import AGENT_NAMES
from tests.test_lessons import USER, FakeVerifier

AUTH = {"Authorization": "Bearer good-token"}
CONTRACT = yaml.safe_load((Path(__file__).parents[1] / "openapi.yaml").read_text(encoding="utf-8"))
OTHER = "11111111-2222-3333-4444-555555555555"


def contract_validator(schema_name: str) -> Draft202012Validator:
    schema = {"components": CONTRACT["components"], "$ref": f"#/components/schemas/{schema_name}"}
    return Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)


def seed_usage(session_factory) -> None:
    now = datetime.now(UTC)
    rows = [
        (USER.id, "grammar", "model-a", True, 100, now),
        (USER.id, "grammar", "model-b", False, None, now),
        (OTHER, "grammar", "model-a", True, 50, now - timedelta(days=1)),
        (USER.id, "vocabulary", "model-a", True, 30, now),
        (USER.id, "cultural", "model-a", True, 10, now - timedelta(days=30)),
    ]
    with session_factory.begin() as session:
        for user_id, agent, model, ok, tokens, created in rows:
            session.add(AiUsage(user_id=user_id, agent=agent, model=model, succeeded=ok, tokens=tokens, created_at=created))


@pytest.fixture
def api(session_factory, monkeypatch):
    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    monkeypatch.setattr(deps, "get_settings", lambda: SimpleNamespace(admin_emails="someone@x.org, JENI@example.com"))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_summary_counts_every_agent_for_all_learners(api, session_factory):
    seed_usage(session_factory)
    body = api.get("/agents/usage/summary?days=7", headers=AUTH).json()
    agents = {a["agent"]: a for a in body["agents"]}

    assert [a["agent"] for a in body["agents"]] == list(AGENT_NAMES)
    grammar = agents["grammar"]
    assert (grammar["calls"], grammar["failures"], grammar["tokens"], grammar["learners"]) == (3, 1, 150, 2)
    assert grammar["failure_rate"] == 0.333 and grammar["models"][0] == "model-a"
    assert [d["calls"] for d in grammar["daily"]] == [1, 2]
    assert agents["cultural"] == {**agents["cultural"], "calls": 0, "last_call_at": None, "daily": [], "models": []}


def test_summary_matches_the_contract(api, session_factory):
    seed_usage(session_factory)
    response = api.get("/agents/usage/summary", headers=AUTH)

    assert response.status_code == 200
    errors = sorted(contract_validator("AiUsageSummary").iter_errors(response.json()), key=str)
    assert errors == []


def test_summary_is_only_for_admins(api, monkeypatch):
    monkeypatch.setattr(deps, "get_settings", lambda: SimpleNamespace(admin_emails="boss@x.org"))
    forbidden = api.get("/agents/usage/summary", headers=AUTH)

    assert forbidden.status_code == 403
    assert contract_validator("Error").is_valid(forbidden.json())
    assert api.get("/agents/usage/summary").status_code == 401


def test_summary_rejects_days_outside_the_contract(api):
    response = api.get("/agents/usage/summary?days=91", headers=AUTH)

    assert response.status_code == 422
    assert contract_validator("ValidationError").is_valid(response.json())


def test_every_contract_path_exists_in_the_code():
    code_paths = app.openapi()["paths"]
    for path, operations in CONTRACT["paths"].items():
        for method in operations:
            assert method in code_paths.get(path, {}), f"{method.upper()} {path} is in openapi.yaml but not in the code"
