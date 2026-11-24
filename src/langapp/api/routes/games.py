from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import GameServiceDep
from langapp.api.schemas import BuilderRoundOut, ErrorOut, WordMatchOut

router = APIRouter(prefix="/game", tags=["games"])


@router.get("/sentences", response_model=BuilderRoundOut, responses={404: {"model": ErrorOut}})
def builder_sentences(
    service: GameServiceDep,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    max_words: Annotated[int, Query(ge=2, le=15)] = 8,
) -> dict:
    return {"sentences": service.builder_round(limit, max_words)}


@router.get("/wordmatch", response_model=WordMatchOut, responses={400: {"model": ErrorOut}, 404: {"model": ErrorOut}})
def word_match(
    service: GameServiceDep,
    language: str = "en-es",
    limit: Annotated[int, Query(ge=2, le=20)] = 5,
) -> dict:
    return service.word_match(language, limit)
