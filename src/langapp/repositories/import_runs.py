from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from langapp.db.models import ImportRun


class ImportRunRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def start(self, source_lang: str, target_langs: Sequence[str]) -> ImportRun:
        run = ImportRun(
            source_lang=source_lang,
            target_langs=",".join(target_langs),
            status="running",
            pages=0,
            fetched=0,
            inserted=0,
            updated=0,
            skipped=0,
        )
        self.session.add(run)
        self.session.flush()
        return run

    def get(self, run_id: int) -> ImportRun | None:
        return self.session.get(ImportRun, run_id)

    def record_page(
        self, run_id: int, fetched: int, inserted: int, updated: int, skipped: int, cursor: str | None
    ) -> None:
        run = self.session.get_one(ImportRun, run_id)
        run.pages += 1
        run.fetched += fetched
        run.inserted += inserted
        run.updated += updated
        run.skipped += skipped
        run.last_cursor = cursor

    def finish(self, run_id: int, status: str, error: str | None = None) -> ImportRun:
        run = self.session.get_one(ImportRun, run_id)
        run.status = status
        run.error = error
        run.finished_at = func.now()
        self.session.flush()
        self.session.refresh(run)
        return run

    def latest(self, limit: int = 10) -> list[ImportRun]:
        stmt = select(ImportRun).order_by(ImportRun.id.desc()).limit(limit)
        return list(self.session.scalars(stmt))
