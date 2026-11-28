from typing import Annotated

from fastapi import APIRouter, Header, Query, Response

from langapp.api.deps import CurrentUser, MnemonicServiceDep
from langapp.api.schemas import ErrorOut, MnemonicIn, MnemonicListOut, MnemonicOut
from langapp.domain import LANG_PATTERN

router = APIRouter(prefix="/mnemonics", tags=["mnemonics"])

LangQuery = Annotated[str, Query(pattern=LANG_PATTERN)]
IdempotencyKeyHeader = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="A new random key per intended save (a UUID). Repeating it returns the saved card.",
    ),
]


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
    responses={code: {"model": ErrorOut} for code in (400, 404, 409, 429)},
)
def save_mnemonic(
    body: MnemonicIn,
    user: CurrentUser,
    service: MnemonicServiceDep,
    response: Response,
    idempotency_key: IdempotencyKeyHeader = None,
) -> dict:
    card, replayed = service.save_once(
        user.id, body.concept_id, body.learning, body.native, body.sentence, idempotency_key
    )
    if idempotency_key is not None:
        response.headers["Idempotent-Replayed"] = "true" if replayed else "false"
    return card
