from fastapi import APIRouter

from langapp.api.deps import AgentOrchestratorDep, CurrentUser
from langapp.api.schemas import ErrorOut, GrammarCheckIn, GrammarCheckOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post(
    "/grammar/check",
    response_model=GrammarCheckOut,
    responses={code: {"model": ErrorOut} for code in (400, 404, 429, 503)},
)
def check_grammar(body: GrammarCheckIn, user: CurrentUser, agents: AgentOrchestratorDep) -> dict:
    return agents.check_shuffle(user.id, body.sentence_id, body.answer, body.learning, body.native)
