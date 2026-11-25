import asyncio
import logging
import threading
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

from langapp.api.deps import get_session, get_token_verifier
from langapp.api.main import app
from langapp.cli import format_usage
from langapp.db.models import AiUsage
from langapp.domain import ItemType
from langapp.errors import InvalidRequest
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.progress import ProgressRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from langapp.services.agents.vocabulary import VocabularyAgent
from langapp.services.insights import Insights
from tests.test_lessons import USER, FakeVerifier
from tests.test_vocabulary_agent import FakeChat, seed_words

AUTH = {"Authorization": "Bearer good-token"}
OTHER = "11111111-2222-3333-4444-555555555555"


def log_calls(session_factory) -> None:
    with session_factory.begin() as session:
        repo = AiUsageRepository(session)
        repo.log(USER.id, "grammar", "tiny:free", True, 120)
        repo.log(USER.id, "grammar", "tiny:free", False)
        repo.log(USER.id, "vocabulary", "tiny:free", True, 80)


def test_summary_groups_calls_failures_tokens_and_learners(session_factory):
    log_calls(session_factory)
    rows = Insights(session_factory).ai_usage(days=1)

    assert [(r["agent"], r["calls"], r["failures"], r["tokens"], r["learners"]) for r in rows] == [
        ("grammar", 2, 1, 120, 1),
        ("vocabulary", 1, 0, 80, 1),
    ]
    assert rows[0]["day"] == datetime.now(UTC).date().isoformat()


def test_format_usage_prints_a_table_with_totals():
    row = {"day": "2026-11-25", "agent": "grammar", "model": "tiny:free"}
    rows = [row | {"calls": 4, "failures": 1, "tokens": 300, "learners": 2}]
    text = format_usage(rows)
    assert "grammar" in text and "Total: 4 calls, 1 failed (25%)." in text
    assert format_usage([]) == "No AI calls in this period."


def test_insights_cannot_write(session_factory):
    insights = Insights(session_factory)
    with insights._read() as session, pytest.raises(DBAPIError, match="read-only"):
        session.add(AiUsage(user_id=USER.id, agent="x", model="y", succeeded=True))
        session.flush()


def test_insights_show_weak_words_and_history_without_chat_text(session_factory):
    ids = seed_words(session_factory)
    with session_factory.begin() as session:
        ProgressRepository(session).record(USER.id, ItemType.WORD, "eng:doctor", False)
        LearningOutcomeRepository(session).add(USER.id, "conversation", "word_used", {"slug": "doctor"}, concept_id=ids["doctor"])

    insights = Insights(session_factory)
    assert insights.weak_words(str(USER.id), "eng", "spa")[0]["slug"] == "doctor"
    history = insights.recent_outcomes(str(USER.id))
    assert history[0]["kind"] == "word_used" and history[0]["detail"] == {"slug": "doctor"}
    assert insights.recent_outcomes(OTHER) == []
    with pytest.raises(InvalidRequest):
        insights.recent_outcomes("not-a-uuid")


def test_agent_calls_are_logged_with_timing_but_no_learner_text(session_factory, caplog):
    ids = seed_words(session_factory)
    with session_factory.begin() as session:
        orchestrator = AgentOrchestrator(
            SentenceRepository(session),
            ConceptRepository(session),
            UserSettingsRepository(session),
            LearningOutcomeRepository(session),
            AiUsageRepository(session),
            grammar=None,
            vocabulary=VocabularyAgent(FakeChat(), ("tiny:free",)),
            cache=ReplyCache(),
            gate=threading.BoundedSemaphore(1),
            limits=AgentLimits(daily_limit=5),
        )
        with caplog.at_level(logging.INFO, logger="langapp"):
            orchestrator.word_help(USER.id, ids["doctor"], "eng", "spa")

    line = next(r.getMessage() for r in caplog.records if r.getMessage().startswith("agent="))
    assert line.startswith("agent=vocabulary model=tiny:free ok=true ms=") and "tokens=30" in line
    assert "doctor" not in line and str(USER.id) not in line


@pytest.fixture
def api(session_factory):
    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_usage_endpoint_counts_today_per_agent(api, session_factory):
    log_calls(session_factory)
    body = api.get("/agents/usage", headers=AUTH).json()

    assert body["used_today"] == 3 and body["by_agent"] == {"grammar": 2, "vocabulary": 1}
    assert body["remaining_today"] == body["daily_limit"] - 3
    assert api.get("/agents/usage").status_code == 401


def test_mcp_server_exposes_read_only_tools(session_factory, monkeypatch):
    pytest.importorskip("mcp")
    from langapp import mcp_server

    seed_words(session_factory)
    log_calls(session_factory)
    monkeypatch.setattr(mcp_server, "_insights", Insights(session_factory))

    tools = asyncio.run(mcp_server.server.list_tools())
    result = asyncio.run(mcp_server.server.call_tool("get_ai_usage", {"days": 1}))

    assert sorted(t.name for t in tools) == [
        "get_ai_usage", "get_learning_history", "get_lesson_words", "get_weak_vocabulary", "list_lessons",
    ]
    assert all(t.annotations.read_only_hint and not t.annotations.destructive_hint for t in tools)
    assert result.structured_content["result"][0]["agent"] == "grammar"
