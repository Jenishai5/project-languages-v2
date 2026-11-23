from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from langapp.api.deps import SentenceRepoDep
from langapp.api.schemas import SentenceOut, SentencePage
from langapp.domain import LANG_PATTERN

router = APIRouter(prefix="/sentences", tags=["sentences"])

Lang = Annotated[str | None, Query(pattern=LANG_PATTERN, examples=["spa"])]


@router.get("", response_model=SentencePage)
def list_sentences(
    repo: SentenceRepoDep,
    lang: Lang = None,
    translation_lang: Lang = None,
    q: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SentencePage:
    sentences, total = repo.list(lang, translation_lang, q, limit, offset)
    return SentencePage(
        items=[SentenceOut.from_model(sentence, translation_lang) for sentence in sentences],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/random", response_model=SentenceOut)
def random_sentence(
    repo: SentenceRepoDep,
    lang: Annotated[str, Query(pattern=LANG_PATTERN)] = "spa",
    translation_lang: Lang = None,
) -> SentenceOut:
    sentence = repo.random(lang, translation_lang)
    if sentence is None:
        raise HTTPException(status_code=404, detail="No sentences match. Run the import first.")
    return SentenceOut.from_model(sentence, translation_lang)


@router.get("/{sentence_id}", response_model=SentenceOut)
def get_sentence(sentence_id: int, repo: SentenceRepoDep) -> SentenceOut:
    sentence = repo.get(sentence_id)
    if sentence is None:
        raise HTTPException(status_code=404, detail=f"Sentence {sentence_id} not found")
    return SentenceOut.from_model(sentence)
