import json
import threading
import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from langapp.api.deps import get_conversation_agent, get_session, get_token_verifier
from langapp.api.main import app
from langapp.domain import ChatReply, ItemType, ParsedConcept, PlannedLesson
from langapp.errors import NotFound
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.progress import ProgressRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.base import LearnerContext
from langapp.services.agents.conversation import ConversationAgent, Correction, Topic, Turn, build_messages, parse_reply
from langapp.services.agents.conversation_service import ConversationService
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from tests.test_lessons import USER, FakeVerifier

AUTH = {"Authorization": "Bearer good-token"}
SINCE = datetime(2000, 1, 1, tzinfo=UTC)
TOPIC = Topic(word="doctor", sentence="My doctor reads a red book.", lesson_words=("doctor", "paper"))


class FakeChat:
    def __init__(self, replies: list[dict] | None = None) -> None:
        self.replies = replies or [{"reply": "Hello! What does your doctor read?", "correction": None}]
        self.calls: list[list[dict]] = []

    def chat_json(self, models, messages, user=None, max_tokens=400):
        self.calls.append(messages)
        reply = self.replies[min(len(self.calls), len(self.replies)) - 1]
        return ChatReply(text=json.dumps(reply, ensure_ascii=False), model="tiny:free", tokens=25)


def seed_card(session_factory) -> int:
    concepts = [
        ParsedConcept(slug="doctor", category="people", terms={"eng": "doctor", "spa": "el médico"}),
        ParsedConcept(slug="paper", category="objects", terms={"eng": "paper", "spa": "el papel"}),
    ]
    with session_factory.begin() as session:
        ids = ConceptRepository(session).upsert_concepts(concepts)
        LessonRepository(session).upsert_lessons(
            [PlannedLesson(slug="work-1", title="Work 1", position=1, concept_slugs=("doctor", "paper"))], ids
        )
        repo = MnemonicRepository(session)
        card = repo.add(USER.id, ids["doctor"], "eng", "spa", "My doctor reads a red book.", None, None, None)
        return card.id


def make_service(session, chat) -> ConversationService:
    orchestrator = AgentOrchestrator(
        SentenceRepository(session),
        ConceptRepository(session),
        UserSettingsRepository(session),
        LearningOutcomeRepository(session),
        AiUsageRepository(session),
        grammar=None,
        vocabulary=None,
        cache=ReplyCache(),
        gate=threading.BoundedSemaphore(2),
        limits=AgentLimits(daily_limit=10, wait_seconds=0.01),
        clock=lambda: datetime.now(UTC),
    )
    return ConversationService(
        orchestrator,
        ConversationAgent(chat, ("tiny:free",)) if chat else None,
        MnemonicRepository(session),
        LessonRepository(session),
        LearningOutcomeRepository(session),
        ProgressRepository(session),
    )


def test_prompt_keeps_the_topic_and_only_the_last_turns():
    context = LearnerContext(user_id=USER.id, learning="eng", native="spa", level="A2")
    history = [Turn("user" if i % 2 else "assistant", f"turn {i}") for i in range(12)]

    messages = build_messages(context, TOPIC, history, "I like books")

    assert "practise English" in messages[0]["content"]
    assert "My doctor reads a red book." in messages[0]["content"] and "doctor, paper" in messages[0]["content"]
    assert [m["content"] for m in messages[1:-1]] == [f"turn {i}" for i in range(4, 12)]
    assert messages[-1] == {"role": "user", "content": "I like books"}


def test_prompt_opens_the_conversation_without_a_message():
    context = LearnerContext(user_id=USER.id, learning="eng", native="spa")
    assert "start our conversation" in build_messages(context, TOPIC, [], None)[-1]["content"]


def test_parse_reply_keeps_real_corrections_only():
    correction = {"wrong": "he read", "right": "he reads", "why": "presente"}
    fixed = parse_reply(json.dumps({"reply": "Nice!", "correction": correction}))
    same = parse_reply(json.dumps({"reply": "Nice!", "correction": {"wrong": "ok", "right": "OK", "why": ""}}))

    assert fixed.correction == Correction("he read", "he reads", "presente")
    assert same.correction is None
    assert parse_reply("Just text, no JSON.").reply == "Just text, no JSON."


def test_start_and_turn_answer_but_save_no_chat(session_factory):
    card_id = seed_card(session_factory)
    chat = FakeChat(
        [
            {"reply": "Hello! What does your doctor read?", "correction": None},
            {
                "reply": "Cool! Is it big?",
                "correction": {"wrong": "He read book", "right": "He reads a book", "why": "falta -s y a"},
            },
        ]
    )
    with session_factory.begin() as session:
        service = make_service(session, chat)
        opening = service.start(USER.id, card_id, "eng", "spa")
        answer = service.turn(USER.id, card_id, "eng", "spa", [Turn("assistant", opening["reply"])], "He read book")

    assert opening["reply"] == "Hello! What does your doctor read?"
    assert opening["word"] == "doctor" and opening["lesson_words"] == ["doctor", "paper"]
    assert answer["correction"]["right"] == "He reads a book"
    assert answer["remaining_today"] == 8
    assert chat.calls[1][-1] == {"role": "user", "content": "He read book"}
    with session_factory() as session:
        assert LearningOutcomeRepository(session).recent_for_user(USER.id) == []
        assert AiUsageRepository(session).count_since(USER.id, SINCE) == 2


def test_finish_saves_words_used_and_mistakes_only(session_factory):
    card_id = seed_card(session_factory)
    with session_factory.begin() as session:
        summary = make_service(session, None).finish(
            USER.id,
            card_id,
            "eng",
            "spa",
            ["My doctor is nice", "I have two papers"],
            [Correction("He read book", "He reads a book", "falta -s")],
        )

    assert summary == {"words_used": ["doctor", "paper"], "mistakes_saved": 1}
    with session_factory() as session:
        kinds = sorted(o.kind for o in LearningOutcomeRepository(session).recent_for_user(USER.id))
        progress = {row.item_key: row.correct_count for row in ProgressRepository(session).for_user(USER.id, ItemType.WORD)}
    assert kinds == ["mistake", "word_used", "word_used"]
    assert progress == {"eng:doctor": 1, "eng:paper": 1}


def test_someone_elses_card_is_not_found(session_factory):
    card_id = seed_card(session_factory)
    with session_factory.begin() as session, pytest.raises(NotFound):
        make_service(session, FakeChat()).start(uuid.uuid4(), card_id, "eng", "spa")


@pytest.fixture
def api(session_factory):
    chat = FakeChat()

    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_conversation_agent] = lambda: ConversationAgent(chat, ("tiny:free",))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_endpoints_run_a_whole_conversation(api, session_factory):
    card_id = seed_card(session_factory)
    base = {"mnemonic_id": card_id, "learning": "eng", "native": "spa"}

    started = api.post("/agents/conversation/start", json=base, headers=AUTH)
    turned = api.post(
        "/agents/conversation/turn",
        json={**base, "history": [{"role": "assistant", "text": "Hello!"}], "message": "My doctor reads"},
        headers=AUTH,
    )
    finished = api.post("/agents/conversation/finish", json={**base, "messages": ["My doctor reads"]}, headers=AUTH)

    assert started.status_code == 200 and started.json()["sentence"] == "My doctor reads a red book."
    assert turned.status_code == 200 and turned.json()["reply"]
    assert finished.json() == {"words_used": ["doctor"], "mistakes_saved": 0}


def test_endpoints_check_login_and_message_length(api, session_factory):
    card_id = seed_card(session_factory)
    base = {"mnemonic_id": card_id, "learning": "eng", "native": "spa"}
    assert api.post("/agents/conversation/start", json=base).status_code == 401
    too_long = {**base, "message": "x" * 301}
    assert api.post("/agents/conversation/turn", json=too_long, headers=AUTH).status_code == 422
