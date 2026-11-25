from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import AgentOrchestratorDep, CurrentUser, LearnerServiceDep
from langapp.api.schemas import ErrorOut, GrammarCheckIn, GrammarCheckOut, WeakWordsOut, WordHelpIn, WordHelpOut
from langapp.domain import LANG_PATTERN

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
