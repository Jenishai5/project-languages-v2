from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import text

from langapp.api.deps import ImportRunRepoDep, SentenceRepoDep
from langapp.api.schemas import HealthOut, ImportRunOut

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut)
def health(repo: SentenceRepoDep) -> HealthOut:
    repo.session.execute(text("SELECT 1"))
    return HealthOut(status="ok", database="ok", sentences=repo.count())


@router.get("/import-runs", response_model=list[ImportRunOut])
def import_runs(
    repo: ImportRunRepoDep, limit: Annotated[int, Query(ge=1, le=50)] = 10
) -> list[ImportRunOut]:
    return [ImportRunOut.model_validate(run) for run in repo.latest(limit)]
