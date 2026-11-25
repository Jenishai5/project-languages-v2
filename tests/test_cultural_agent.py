import json
import threading
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_cultural_agent, get_reply_cache, get_session, get_token_verifier
from langapp.api.main import app
from langapp.domain import ChatReply
from langapp.errors import ExternalSourceError
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.base import LearnerContext, ask_with_retry
from langapp.services.agents.cultural import CulturalAgent, build_messages, parse_note
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from tests.test_lessons import USER, FakeVerifier
from tests.test_vocabulary_agent import seed_words

AUTH = {"Authorization": "Bearer good-token"}
NOTE = {
    "note": "En inglés, 'doctor' también se usa como título: Doctor Smith.",
    "expressions": [{"phrase": "An apple a day keeps the doctor away", "meaning": "Comer sano evita enfermedades"}],
    "fun_fact": "En el Reino Unido muchos cirujanos se llaman 'Mr', no 'Dr'.",
}


class FakeChat:
    def __init__(self, texts: list[str] | None = None, errors: int = 0) -> None:
        self.texts = texts or [json.dumps(NOTE, ensure_ascii=False)]
        self.errors = errors
        self.calls = 0

    def chat_json(self, models, messages, user=None, max_tokens=400):
        self.calls += 1
        if self.calls <= self.errors:
            raise ExternalSourceError("free model failed")
        return ChatReply(text=self.texts[min(self.calls, len(self.texts)) - 1], model="tiny:free")


def make_orchestrator(session, chat, cache=None) -> AgentOrchestrator:
    return AgentOrchestrator(
        SentenceRepository(session),
        ConceptRepository(session),
        UserSettingsRepository(session),
        LearningOutcomeRepository(session),
        AiUsageRepository(session),
        grammar=None,
        vocabulary=None,
        cache=cache or ReplyCache(),
        gate=threading.BoundedSemaphore(2),
        limits=AgentLimits(daily_limit=5, wait_seconds=0.01),
        clock=lambda: datetime.now(UTC),
        cultural=CulturalAgent(chat, ("tiny:free",)) if chat else None,
    )


def test_prompt_asks_for_real_usage_and_no_invented_facts():
    context = LearnerContext(user_id=USER.id, learning="eng", native="spa", level="B1")
    system, student = build_messages(context, "doctor", "el médico")

    assert "culture behind English words" in system["content"] and "simple Spanish" in system["content"]
    assert "Never invent facts" in system["content"]
    assert json.loads(student["content"]) == {"word": "doctor", "meaning": "el médico"}


def test_parse_note_drops_empty_expressions_and_keeps_plain_text():
    note = parse_note(json.dumps({**NOTE, "expressions": [{"phrase": ""}, *NOTE["expressions"]], "fun_fact": None}))
    assert len(note.expressions) == 1 and note.fun_fact is None
    assert parse_note("Doctors are respected.").note == "Doctors are respected."


def test_ask_with_retry_tries_again_after_a_failure_and_an_empty_answer():
    chat = FakeChat(texts=["", "{}", json.dumps(NOTE)], errors=1)
    result = ask_with_retry(chat, ["m"], [], "u", 100, 3, parse_note, lambda n: bool(n.note))
    assert result.note.startswith("En inglés") and chat.calls == 3


def test_culture_note_is_cached_and_saved(session_factory):
    ids = seed_words(session_factory)
    chat, cache = FakeChat(), ReplyCache()
    with session_factory.begin() as session:
        first = make_orchestrator(session, chat, cache).culture_note(USER.id, ids["doctor"], "eng", "spa")
    with session_factory.begin() as session:
        second = make_orchestrator(session, chat, cache).culture_note(USER.id, ids["doctor"], "eng", "spa")

    assert first["available"] and first["expressions"][0]["phrase"].startswith("An apple")
    assert second["cached"] and chat.calls == 1
    with session_factory() as session:
        kinds = [o.kind for o in LearningOutcomeRepository(session).recent_for_user(USER.id)]
    assert kinds == ["culture_note", "culture_note"]


def test_culture_note_without_ai_says_so(session_factory):
    ids = seed_words(session_factory)
    with session_factory.begin() as session:
        result = make_orchestrator(session, None).culture_note(USER.id, ids["cat"], "eng", "spa")
    assert result["available"] is False and result["note"] is None


@pytest.fixture
def api(session_factory):
    chat = FakeChat()

    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_cultural_agent] = lambda: CulturalAgent(chat, ("tiny:free",))
    app.dependency_overrides[get_reply_cache] = lambda: ReplyCache()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_endpoint_explains_culture(api, session_factory):
    ids = seed_words(session_factory)
    body = {"concept_id": ids["doctor"], "learning": "eng", "native": "spa"}

    response = api.post("/agents/cultural/explain", json=body, headers=AUTH)

    assert response.status_code == 200 and response.json()["fun_fact"].startswith("En el Reino Unido")
    assert api.post("/agents/cultural/explain", json=body).status_code == 401
