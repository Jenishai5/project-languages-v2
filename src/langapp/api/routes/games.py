from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from langapp.api.deps import SentenceRepoDep, WordPairRepoDep
from langapp.services.games import PROMPT_LANGS, UnknownGameMode, check_word_match_mode, sentence_exercise, word_match_round

router = APIRouter(prefix="/game", tags=["games"])


@router.get("/sentences")
def builder_sentences(
    repo: SentenceRepoDep,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    max_words: Annotated[int, Query(ge=2, le=15)] = 8,
) -> JSONResponse:
    sentences = repo.random_for_builder("eng", PROMPT_LANGS["es"], max_words, limit)
    if not sentences:
        return JSONResponse(
            status_code=404,
            content={"error": "No sentences for the builder yet. Run: make import-builder"},
        )
    translations = repo.translations_for([s.id for s in sentences], list(PROMPT_LANGS.values()))
    return JSONResponse({"sentences": [sentence_exercise(s, translations.get(s.id, {})) for s in sentences]})


@router.get("/wordmatch")
def word_match(
    repo: WordPairRepoDep,
    language: str = "en-es",
    limit: Annotated[int, Query(ge=2, le=20)] = 5,
) -> JSONResponse:
    try:
        pair = check_word_match_mode(language)
    except UnknownGameMode as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    pairs = repo.random_round(pair, limit)
    if not pairs:
        return JSONResponse(
            status_code=404,
            content={"error": f'No words for "{language}" yet. Run: make import-words'},
        )
    return JSONResponse(word_match_round(pairs))
