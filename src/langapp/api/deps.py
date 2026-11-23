from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from langapp.db.session import get_session_factory
from langapp.repositories.import_runs import ImportRunRepository
from langapp.repositories.sentences import SentenceRepository


def get_session() -> Iterator[Session]:
    with get_session_factory()() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_sentence_repository(session: SessionDep) -> SentenceRepository:
    return SentenceRepository(session)


def get_import_run_repository(session: SessionDep) -> ImportRunRepository:
    return ImportRunRepository(session)


SentenceRepoDep = Annotated[SentenceRepository, Depends(get_sentence_repository)]
ImportRunRepoDep = Annotated[ImportRunRepository, Depends(get_import_run_repository)]
