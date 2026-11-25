import uuid
from collections.abc import Sequence

from langapp.domain import ItemType
from langapp.errors import NotFound
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.progress import ProgressRepository
from langapp.services.agents.conversation import AGENT, ConversationAgent, Correction, PartnerReply, Topic, Turn
from langapp.services.agents.orchestrator import AgentOrchestrator, Answer
from langapp.services.lessons import word_cards
from langapp.services.mnemonics import mask_sentence
from langapp.services.progress import word_key


class ConversationService:
    def __init__(
        self,
        orchestrator: AgentOrchestrator,
        agent: ConversationAgent | None,
        mnemonics: MnemonicRepository,
        lessons: LessonRepository,
        outcomes: LearningOutcomeRepository,
        progress: ProgressRepository,
    ) -> None:
        self._orchestrator = orchestrator
        self._agent = agent
        self._mnemonics = mnemonics
        self._lessons = lessons
        self._outcomes = outcomes
        self._progress = progress

    def start(self, user_id: uuid.UUID, mnemonic_id: int, learning: str, native: str) -> dict:
        topic, _ = self._topic(user_id, mnemonic_id, learning, native)
        answer = self._reply(user_id, learning, native, topic, [], None)
        topic_view = {"word": topic.word, "sentence": topic.sentence, "lesson_words": list(topic.lesson_words)}
        return {**self._view(user_id, answer), **topic_view}

    def turn(
        self, user_id: uuid.UUID, mnemonic_id: int, learning: str, native: str, history: Sequence[Turn], message: str
    ) -> dict:
        topic, _ = self._topic(user_id, mnemonic_id, learning, native)
        return self._view(user_id, self._reply(user_id, learning, native, topic, history, message))

    def finish(
        self,
        user_id: uuid.UUID,
        mnemonic_id: int,
        learning: str,
        native: str,
        messages: Sequence[str],
        corrections: Sequence[Correction],
    ) -> dict:
        _, cards = self._topic(user_id, mnemonic_id, learning, native)
        used = [card for card in cards if any(mask_sentence(text, card["word"], learning) for text in messages)]
        for card in used:
            detail = {"slug": card["slug"]}
            self._outcomes.add(user_id, agent=AGENT, kind="word_used", concept_id=card["concept_id"], detail=detail)
            self._progress.record(user_id, ItemType.WORD, word_key(learning, card["slug"]), True)
        for correction in corrections:
            self._outcomes.add(user_id, agent=AGENT, kind="mistake", detail=correction.view())
        return {"words_used": [card["word"] for card in used], "mistakes_saved": len(corrections)}

    def _topic(self, user_id: uuid.UUID, mnemonic_id: int, learning: str, native: str) -> tuple[Topic, list[dict]]:
        mnemonic = self._mnemonics.get_for_user(user_id, mnemonic_id)
        if mnemonic is None or mnemonic.learning_lang != learning:
            raise NotFound("Picture card not found.")
        own = word_cards([mnemonic.concept], learning, native)
        if not own:
            raise NotFound("Picture card not found.")
        neighbours = word_cards(self._lessons.concepts_in_same_lesson(mnemonic.concept_id), learning, native)
        cards = own + [card for card in neighbours if card["concept_id"] != mnemonic.concept_id]
        topic = Topic(word=own[0]["word"], sentence=mnemonic.text, lesson_words=tuple(card["word"] for card in cards[:10]))
        return topic, cards

    def _reply(
        self, user_id: uuid.UUID, learning: str, native: str, topic: Topic, history: Sequence[Turn], message: str | None
    ) -> Answer:
        context = self._orchestrator.learner(user_id, learning, native)
        return self._orchestrator.ask(
            context,
            AGENT,
            self._agent,
            None,
            lambda agent: agent.reply(context, topic, history, message),
            lambda reply: bool(reply.reply),
        )

    def _view(self, user_id: uuid.UUID, answer: Answer) -> dict:
        reply = answer.value if isinstance(answer.value, PartnerReply) else None
        return {
            "available": reply is not None,
            "reply": reply.reply if reply else None,
            "correction": reply.correction.view() if reply and reply.correction else None,
            "message": answer.message,
            "remaining_today": self._orchestrator.remaining_today(user_id),
        }
