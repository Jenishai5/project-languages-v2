import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy.orm import Session, sessionmaker

from langapp.db.models import ImportRun
from langapp.ingestion.parser import ParseIssue, ParsePageError, parse_page
from langapp.ingestion.tatoeba_client import TatoebaClient, TatoebaError
from langapp.repositories.import_runs import ImportRunRepository
from langapp.repositories.sentences import SentenceRepository

logger = logging.getLogger(__name__)


@dataclass
class ImportSummary:
    run: ImportRun
    issues: list[ParseIssue] = field(default_factory=list)


class SentenceImporter:
    def __init__(self, client: TatoebaClient, session_factory: sessionmaker[Session]) -> None:
        self._client = client
        self._session_factory = session_factory

    def run(
        self, source_lang: str, target_langs: Sequence[str], max_pages: int | None = 1
    ) -> ImportSummary:
        with self._session_factory.begin() as session:
            run_id = ImportRunRepository(session).start(source_lang, target_langs).id

        issues: list[ParseIssue] = []
        try:
            for page in self._client.iter_sentence_pages(source_lang, target_langs, max_pages):
                result = parse_page(page.payload)
                issues.extend(result.issues)
                with self._session_factory.begin() as session:
                    stats = SentenceRepository(session).upsert_many(result.sentences)
                    ImportRunRepository(session).record_page(
                        run_id,
                        fetched=len(page.payload["data"]),
                        inserted=stats.inserted,
                        updated=stats.updated,
                        skipped=len(page.payload["data"]) - len(result.sentences),
                        cursor=page.next_url,
                    )
                logger.info(
                    "page saved: %d new, %d updated, %d unchanged, %d issues",
                    stats.inserted,
                    stats.updated,
                    stats.unchanged,
                    len(result.issues),
                )
        except (TatoebaError, ParsePageError) as exc:
            logger.error("import failed: %s", exc)
            return ImportSummary(run=self._finish(run_id, "failed", str(exc)), issues=issues)

        return ImportSummary(run=self._finish(run_id, "succeeded"), issues=issues)

    def _finish(self, run_id: int, status: str, error: str | None = None) -> ImportRun:
        with self._session_factory.begin() as session:
            return ImportRunRepository(session).finish(run_id, status, error)
