from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from langapp.auth import AuthError, AuthUser, SupabaseTokenVerifier
from langapp.config import get_settings
from langapp.db.session import get_session_factory
from langapp.repositories.import_runs import ImportRunRepository
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.progress import ProgressRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.word_pairs import WordPairRepository


def get_session() -> Iterator[Session]:
    with get_session_factory()() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_sentence_repository(session: SessionDep) -> SentenceRepository:
    return SentenceRepository(session)


def get_import_run_repository(session: SessionDep) -> ImportRunRepository:
    return ImportRunRepository(session)


def get_word_pair_repository(session: SessionDep) -> WordPairRepository:
    return WordPairRepository(session)


def get_progress_repository(session: SessionDep) -> ProgressRepository:
    return ProgressRepository(session)


def get_lesson_repository(session: SessionDep) -> LessonRepository:
    return LessonRepository(session)


@lru_cache
def get_token_verifier() -> SupabaseTokenVerifier | None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    return SupabaseTokenVerifier(settings.supabase_url, settings.supabase_anon_key)


def get_current_user(
    verifier: Annotated[SupabaseTokenVerifier | None, Depends(get_token_verifier)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser:
    if verifier is None:
        raise HTTPException(status_code=503, detail="Login is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided.")
    try:
        return verifier.verify(authorization.removeprefix("Bearer ").strip())
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


SentenceRepoDep = Annotated[SentenceRepository, Depends(get_sentence_repository)]
ImportRunRepoDep = Annotated[ImportRunRepository, Depends(get_import_run_repository)]
WordPairRepoDep = Annotated[WordPairRepository, Depends(get_word_pair_repository)]
ProgressRepoDep = Annotated[ProgressRepository, Depends(get_progress_repository)]
LessonRepoDep = Annotated[LessonRepository, Depends(get_lesson_repository)]
CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
