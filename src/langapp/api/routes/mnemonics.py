from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import CurrentUser, MnemonicServiceDep
from langapp.api.schemas import ErrorOut, MnemonicIn, MnemonicListOut, MnemonicOut
from langapp.domain import LANG_PATTERN

router = APIRouter(prefix="/mnemonics", tags=["mnemonics"])

LangQuery = Annotated[str, Query(pattern=LANG_PATTERN)]


@router.get("", response_model=MnemonicListOut, responses={400: {"model": ErrorOut}})
def list_mnemonics(
    user: CurrentUser,
    service: MnemonicServiceDep,
    learning: LangQuery = "eng",
    native: LangQuery = "spa",
) -> dict:
    return service.list(user.id, learning, native)


@router.post(
    "",
    response_model=MnemonicOut,
    responses={code: {"model": ErrorOut} for code in (400, 404, 429, 502, 503)},
)
def create_mnemonic(body: MnemonicIn, user: CurrentUser, service: MnemonicServiceDep) -> dict:
    return service.create(user.id, body.concept_id, body.learning, body.native)
