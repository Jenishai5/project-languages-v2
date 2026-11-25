import json
import threading
import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_grammar_agent, get_reply_cache, get_session, get_token_verifier
from langapp.api.main import app
from langapp.db.models import UserSettings
from langapp.domain import ChatReply, ParsedSentence, ParsedTranslation
from langapp.errors import ExternalSourceError, InvalidRequest, RateLimited, ServiceUnavailable, UpstreamRateLimited
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.base import LearnerContext, model_list
from langapp.services.agents.grammar import GrammarAgent, build_messages, parse_feedback
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from tests.test_lessons import USER, FakeVerifier

AUTH = {"Authorization": "Bearer good-token"}
SENTENCE_ID = 101
REPLY = {
    "explanation": "En inglés el sujeto va antes del verbo.",
    "mistakes": [{"wrong": "reads the doctor", "right": "the doctor reads", "why": "sujeto + verbo"}],
    "tip": "Busca primero quién hace la acción.",
}


class FakeChat:
    def __init__(self, text: str | None = None, error: Exception | None = None, failures: int = 0) -> None:
        self.text = text if text is not None else json.dumps(REPLY, ensure_ascii=False)
        self.error = error
        self.failures = failures
        self.calls: list[dict] = []

    def chat_json(self, models, messages, user=None, max_tokens=400):
        self.calls.append({"models": list(models), "messages": messages, "user": user, "max_tokens": max_tokens})
        if self.error:
            raise self.error
        if len(self.calls) <= self.failures:
            raise ExternalSourceError("one free model failed")
        return ChatReply(text=self.text, model="tiny:free", tokens=42)


def seed_sentence(session_factory) -> None:
    sentence = ParsedSentence(
        id=SENTENCE_ID,
        lang="eng",
        text="The doctor reads the paper.",
        translations=(ParsedTranslation(id=102, lang="spa", text="El médico lee el periódico."),),
    )
    with session_factory.begin() as session:
        SentenceRepository(session).upsert_many([sentence])


def make_orchestrator(session, chat: FakeChat | None, cache=None, gate=None, limit=5) -> AgentOrchestrator:
    grammar = GrammarAgent(chat, ("tiny:free", "backup:free")) if chat else None
    return AgentOrchestrator(
        SentenceRepository(session),
        ConceptRepository(session),
        UserSettingsRepository(session),
        LearningOutcomeRepository(session),
        AiUsageRepository(session),
        grammar=grammar,
        vocabulary=None,
        cache=cache or ReplyCache(),
        gate=gate or threading.BoundedSemaphore(2),
        limits=AgentLimits(daily_limit=limit, wait_seconds=0.01),
        clock=lambda: datetime.now(UTC),
    )


WRONG = ["reads", "The", "doctor", "the", "paper"]
RIGHT = ["The", "doctor", "reads", "the", "paper"]


def test_model_list_falls_back_to_the_text_model():
    assert model_list("a:free, b:free ,", "openrouter/free") == ("a:free", "b:free")
    assert model_list("", "openrouter/free") == ("openrouter/free",)


def test_prompt_names_languages_level_and_both_sentences():
    context = LearnerContext(user_id=USER.id, learning="eng", native="spa", level="A2")
    system, student = build_messages(context, "The doctor reads", "reads The doctor", "El médico lee")

    assert "English grammar teacher" in system["content"]
    assert "level A2" in system["content"] and "simple Spanish" in system["content"]
    assert json.loads(student["content"]) == {
        "correct_sentence": "The doctor reads",
        "student_answer": "reads The doctor",
        "meaning": "El médico lee",
    }


def test_parse_feedback_reads_json_inside_a_code_fence():
    feedback = parse_feedback("```json\n" + json.dumps(REPLY) + "\n```", "m")

    assert feedback.explanation == REPLY["explanation"]
    assert feedback.mistakes_view() == REPLY["mistakes"]
    assert feedback.tip == REPLY["tip"]


def test_parse_feedback_keeps_plain_text_and_drops_bad_items():
    assert parse_feedback("Subject first, then the verb.").explanation == "Subject first, then the verb."
    messy = parse_feedback(json.dumps({"explanation": "ok", "mistakes": ["x", {"why": "w"}] + [{"wrong": "a"}] * 5}))
    assert len(messy.mistakes) == 3
    assert messy.tip is None


def test_correct_answer_never_calls_the_model(session_factory):
    seed_sentence(session_factory)
    chat = FakeChat()
    with session_factory.begin() as session:
        result = make_orchestrator(session, chat).check_shuffle(USER.id, SENTENCE_ID, RIGHT, "eng", "spa")

    assert result["correct"] is True
    assert chat.calls == []
    assert result["remaining_today"] == 5


def test_wrong_answer_is_explained_logged_and_saved(session_factory):
    seed_sentence(session_factory)
    chat = FakeChat()
    with session_factory.begin() as session:
        result = make_orchestrator(session, chat).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")

    assert result["available"] is True and result["correct"] is False
    assert result["explanation"] == REPLY["explanation"]
    assert result["remaining_today"] == 4
    assert chat.calls[0]["models"] == ["tiny:free", "backup:free"]
    assert json.loads(chat.calls[0]["messages"][1]["content"])["meaning"] == "El médico lee el periódico."

    with session_factory() as session:
        outcome = LearningOutcomeRepository(session).recent_for_user(USER.id)[0]
        assert (outcome.agent, outcome.kind, outcome.model) == ("grammar", "mistake", "tiny:free")
        assert outcome.detail["answer"] == "reads The doctor the paper"
        assert AiUsageRepository(session).count_since(USER.id, datetime(2000, 1, 1, tzinfo=UTC)) == 1


def test_same_mistake_twice_uses_the_cache(session_factory):
    seed_sentence(session_factory)
    chat, cache = FakeChat(), ReplyCache()
    with session_factory.begin() as session:
        make_orchestrator(session, chat, cache).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")
    with session_factory.begin() as session:
        second = make_orchestrator(session, chat, cache).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")

    assert len(chat.calls) == 1
    assert second["cached"] is True and second["remaining_today"] == 4


def test_daily_limit_stops_new_calls(session_factory):
    seed_sentence(session_factory)
    with session_factory.begin() as session:
        AiUsageRepository(session).log(USER.id, "grammar", "tiny:free", True)
    with session_factory.begin() as session, pytest.raises(RateLimited):
        make_orchestrator(session, FakeChat(), limit=1).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")


def test_tiles_from_another_sentence_are_refused(session_factory):
    seed_sentence(session_factory)
    with session_factory.begin() as session, pytest.raises(InvalidRequest):
        make_orchestrator(session, FakeChat()).check_shuffle(
            USER.id, SENTENCE_ID, ["ignore", "your", "rules", "the", "paper"], "eng", "spa"
        )


def test_model_failure_is_counted_and_answered_kindly(session_factory):
    seed_sentence(session_factory)
    chat = FakeChat(error=ExternalSourceError("model is gone"))
    with session_factory.begin() as session:
        result = make_orchestrator(session, chat).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")

    assert result["available"] is False and "could not answer" in result["message"]
    assert result["remaining_today"] == 4


def test_one_failed_model_is_retried_once(session_factory):
    seed_sentence(session_factory)
    chat = FakeChat(failures=1)
    with session_factory.begin() as session:
        result = make_orchestrator(session, chat).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")

    assert result["available"] is True
    assert len(chat.calls) == 2


def test_upstream_rate_limit_is_passed_on(session_factory):
    seed_sentence(session_factory)
    chat = FakeChat(error=UpstreamRateLimited("busy"))
    with session_factory.begin() as session, pytest.raises(UpstreamRateLimited):
        make_orchestrator(session, chat).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")


def test_full_gate_answers_busy(session_factory):
    seed_sentence(session_factory)
    gate = threading.BoundedSemaphore(1)
    gate.acquire()
    with session_factory.begin() as session, pytest.raises(ServiceUnavailable):
        make_orchestrator(session, FakeChat(), gate=gate).check_shuffle(USER.id, SENTENCE_ID, WRONG, "eng", "spa")


def test_level_comes_from_user_settings_and_defaults_to_a1(session_factory):
    with session_factory.begin() as session:
        UserSettingsRepository(session).save_settings(USER.id, "spa", "eng")
        session.get(UserSettings, USER.id).level = "B1"
    with session_factory() as session:
        orchestrator = make_orchestrator(session, None)
        assert orchestrator.learner(USER.id, "eng", "spa").level == "B1"
        assert orchestrator.learner(uuid.uuid4(), "eng", "spa").level == "A1"


@pytest.fixture
def api(session_factory):
    chat = FakeChat()

    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_grammar_agent] = lambda: GrammarAgent(chat, ("tiny:free",))
    app.dependency_overrides[get_reply_cache] = lambda: ReplyCache()
    yield TestClient(app), chat
    app.dependency_overrides.clear()


def test_endpoint_explains_a_wrong_order(api, session_factory):
    seed_sentence(session_factory)
    client, chat = api
    body = {"sentence_id": SENTENCE_ID, "answer": WRONG, "learning": "eng", "native": "spa"}

    response = client.post("/agents/grammar/check", json=body, headers=AUTH)

    assert response.status_code == 200
    assert response.json()["mistakes"][0]["right"] == "the doctor reads"
    assert chat.calls[0]["user"] == str(USER.id)


def test_endpoint_needs_login_and_valid_input(api):
    client, _ = api
    assert client.post("/agents/grammar/check", json={}).status_code == 401
    bad = {"sentence_id": 1, "answer": [], "learning": "eng", "native": "spa"}
    assert client.post("/agents/grammar/check", json=bad, headers=AUTH).status_code == 422


def test_endpoint_unknown_sentence_is_404(api):
    client, _ = api
    body = {"sentence_id": 999, "answer": ["a"], "learning": "eng", "native": "spa"}
    assert client.post("/agents/grammar/check", json=body, headers=AUTH).status_code == 404
