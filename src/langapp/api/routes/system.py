from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from langapp.api.deps import ImportRunRepoDep, SentenceRepoDep
from langapp.api.schemas import HealthOut, ImportRunOut

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut, responses={503: {"description": "Database unavailable"}})
def health(repo: SentenceRepoDep) -> HealthOut | JSONResponse:
    try:
        repo.session.execute(text("SELECT 1"))
        sentences = repo.count()
    except SQLAlchemyError as exc:
        reason = str(exc.orig if getattr(exc, "orig", None) else exc).strip().splitlines()[0]
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unavailable", "reason": reason[:300]},
        )
    return HealthOut(status="ok", database="ok", sentences=sentences)


@router.get("/import-runs", response_model=list[ImportRunOut])
def import_runs(
    repo: ImportRunRepoDep, limit: Annotated[int, Query(ge=1, le=50)] = 10
) -> list[ImportRunOut]:
    return [ImportRunOut.model_validate(run) for run in repo.latest(limit)]
