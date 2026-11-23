import argparse
import logging
import sys

from langapp.config import get_settings
from langapp.db.session import get_session_factory
from langapp.ingestion.tatoeba_client import TatoebaClient
from langapp.services.import_service import SentenceImporter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="langapp")
    commands = parser.add_subparsers(dest="command", required=True)

    run_import = commands.add_parser("import", help="Import sentences from Tatoeba")
    run_import.add_argument("--source", default="spa", help="language of the sentences (ISO 639-3)")
    run_import.add_argument("--targets", nargs="*", default=["eng", "rus"], help="translation languages")
    run_import.add_argument("--pages", type=int, default=1, help="pages to fetch, 50 sentences each")
    return parser


def run_import(source: str, targets: list[str], pages: int) -> int:
    settings = get_settings()
    client = TatoebaClient(
        base_url=settings.tatoeba_base_url,
        timeout_seconds=settings.tatoeba_timeout_seconds,
        max_retries=settings.tatoeba_max_retries,
        min_interval_seconds=settings.tatoeba_min_interval_seconds,
        user_agent=settings.tatoeba_user_agent,
    )
    with client:
        summary = SentenceImporter(client, get_session_factory()).run(source, targets, pages)

    run = summary.run
    print(
        f"Import #{run.id} {run.status}: {run.pages} page(s), {run.fetched} fetched, "
        f"{run.inserted} new rows, {run.updated} updated rows, {run.skipped} skipped records"
    )
    for issue in summary.issues[:10]:
        print(f"  issue (id={issue.record_id}): {issue.reason}")
    if run.error:
        print(f"  error: {run.error}")
    return 0 if run.status == "succeeded" else 1


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    args = build_parser().parse_args(argv)
    if args.command == "import":
        return run_import(args.source, args.targets, args.pages)
    return 2


if __name__ == "__main__":
    sys.exit(main())
