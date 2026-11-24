from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import SentenceServiceDep
from langapp.api.schemas import SentenceOut, SentencePage
from langapp.domain import LANG_PATTERN

router = APIRouter(prefix="/sentences", tags=["sentences"])

Lang = Annotated[str | None, Query(pattern=LANG_PATTERN, examples=["spa"])]


@router.get("", response_model=SentencePage)
def list_sentences(
    service: SentenceServiceDep,
    lang: Lang = None,
    translation_lang: Lang = None,
    q: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SentencePage:
    sentences, total = service.search(lang, translation_lang, q, limit, offset)
    return SentencePage(
        items=[SentenceOut.from_model(sentence, translation_lang) for sentence in sentences],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/random", response_model=SentenceOut)
def random_sentence(
    service: SentenceServiceDep,
    lang: Annotated[str, Query(pattern=LANG_PATTERN)] = "spa",
    translation_lang: Lang = None,
) -> SentenceOut:
    return SentenceOut.from_model(service.random(lang, translation_lang), translation_lang)


@router.get("/{sentence_id}", response_model=SentenceOut)
def get_sentence(sentence_id: int, service: SentenceServiceDep) -> SentenceOut:
    return SentenceOut.from_model(service.get(sentence_id))
