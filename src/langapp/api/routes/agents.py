from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import AgentOrchestratorDep, ConversationServiceDep, CurrentUser, LearnerServiceDep
from langapp.api.schemas import (
    ConversationFinishIn,
    ConversationReplyOut,
    ConversationStartIn,
    ConversationStartOut,
    ConversationSummaryOut,
    ConversationTurnIn,
    CultureNoteOut,
    ErrorOut,
    GrammarCheckIn,
    GrammarCheckOut,
    WeakWordsOut,
    WordHelpIn,
    WordHelpOut,
)
from langapp.domain import LANG_PATTERN
from langapp.services.agents.conversation import Correction, Turn

router = APIRouter(prefix="/agents", tags=["agents"])

AGENT_ERRORS = {code: {"model": ErrorOut} for code in (400, 404, 429, 503)}
LangQuery = Annotated[str, Query(pattern=LANG_PATTERN)]


@router.post("/grammar/check", response_model=GrammarCheckOut, responses=AGENT_ERRORS)
def check_grammar(body: GrammarCheckIn, user: CurrentUser, agents: AgentOrchestratorDep) -> dict:
    return agents.check_shuffle(user.id, body.sentence_id, body.answer, body.learning, body.native)


@router.get("/vocabulary/weak", response_model=WeakWordsOut)
def weak_words(
    user: CurrentUser,
    learner: LearnerServiceDep,
    learning: LangQuery,
    native: LangQuery,
    lesson_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=10)] = 3,
) -> dict:
    return {"words": learner.weak_words(user.id, learning, native, lesson_id, limit)}


@router.post("/vocabulary/help", response_model=WordHelpOut, responses=AGENT_ERRORS)
def word_help(body: WordHelpIn, user: CurrentUser, agents: AgentOrchestratorDep) -> dict:
    return agents.word_help(user.id, body.concept_id, body.learning, body.native)


@router.post("/conversation/start", response_model=ConversationStartOut, responses=AGENT_ERRORS)
def start_conversation(body: ConversationStartIn, user: CurrentUser, chat: ConversationServiceDep) -> dict:
    return chat.start(user.id, body.mnemonic_id, body.learning, body.native)


@router.post("/conversation/turn", response_model=ConversationReplyOut, responses=AGENT_ERRORS)
def conversation_turn(body: ConversationTurnIn, user: CurrentUser, chat: ConversationServiceDep) -> dict:
    history = [Turn(role=turn.role, text=turn.text) for turn in body.history]
    return chat.turn(user.id, body.mnemonic_id, body.learning, body.native, history, body.message)


@router.post("/conversation/finish", response_model=ConversationSummaryOut, responses={404: {"model": ErrorOut}})
def finish_conversation(body: ConversationFinishIn, user: CurrentUser, chat: ConversationServiceDep) -> dict:
    corrections = [Correction(c.wrong, c.right, c.why) for c in body.corrections]
    return chat.finish(user.id, body.mnemonic_id, body.learning, body.native, body.messages, corrections)


@router.post("/cultural/explain", response_model=CultureNoteOut, responses=AGENT_ERRORS)
def explain_culture(body: WordHelpIn, user: CurrentUser, agents: AgentOrchestratorDep) -> dict:
    return agents.culture_note(user.id, body.concept_id, body.learning, body.native)
