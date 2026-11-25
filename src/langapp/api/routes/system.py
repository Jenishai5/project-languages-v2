from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import SystemServiceDep
from langapp.api.schemas import ErrorOut, HealthOut, ImportRunOut

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthOut, responses={503: {"model": ErrorOut}})
def health(service: SystemServiceDep) -> dict:
    return service.check()


@router.get("/import-runs", response_model=list[ImportRunOut])
def import_runs(service: SystemServiceDep, limit: Annotated[int, Query(ge=1, le=50)] = 10) -> list[ImportRunOut]:
    return [ImportRunOut.model_validate(run) for run in service.latest_imports(limit)]
