import logging

from sqlalchemy.exc import SQLAlchemyError

from langapp.db.models import ImportRun
from langapp.errors import ServiceUnavailable
from langapp.repositories.import_runs import ImportRunRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.system import DatabaseCheck

logger = logging.getLogger(__name__)


class SystemService:
    def __init__(self, database: DatabaseCheck, sentences: SentenceRepository, import_runs: ImportRunRepository) -> None:
        self._database = database
        self._sentences = sentences
        self._import_runs = import_runs

    def check(self) -> dict:
        try:
            self._database.ping()
            sentences = self._sentences.count()
        except SQLAlchemyError:
            logger.exception("health check: database unavailable")
            raise ServiceUnavailable("Database unavailable. Is it running? Try: make db") from None
        return {"status": "ok", "database": "ok", "sentences": sentences}

    def latest_imports(self, limit: int) -> list[ImportRun]:
        return self._import_runs.latest(limit)
