import argparse
import logging
import sys
from pathlib import Path

from langapp.config import get_settings
from langapp.db.session import get_session_factory
from langapp.ingestion.tatoeba_client import TatoebaClient
from langapp.services.import_service import SentenceImporter
from langapp.services.word_import import import_word_files

DEFAULT_DICTIONARY_DIR = Path("data/dictionaries")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="langapp")
    commands = parser.add_subparsers(dest="command", required=True)

    run_import = commands.add_parser("import", help="Import sentences from Tatoeba")
    run_import.add_argument("--source", default="spa", help="language of the sentences (ISO 639-3)")
    run_import.add_argument("--targets", nargs="*", default=["eng", "rus"], help="translation languages")
    run_import.add_argument("--pages", type=int, default=1, help="pages to fetch, 50 sentences each")
    run_import.add_argument("--max-words", type=int, default=None, help="only sentences with at most N words")
    run_import.add_argument("--with-audio", action="store_true", help="only sentences that have a recording")

    words = commands.add_parser("import-words", help="Import word pairs from dictionary JSON files")
    words.add_argument("files", nargs="*", type=Path, help="files like dictionary-en-es.json")
    return parser


def run_import(source: str, targets: list[str], pages: int, max_words: int | None, with_audio: bool) -> int:
    settings = get_settings()
    client = TatoebaClient(
        base_url=settings.tatoeba_base_url,
        timeout_seconds=settings.tatoeba_timeout_seconds,
        max_retries=settings.tatoeba_max_retries,
        min_interval_seconds=settings.tatoeba_min_interval_seconds,
        user_agent=settings.tatoeba_user_agent,
    )
    with client:
        summary = SentenceImporter(client, get_session_factory()).run(
            source, targets, pages, max_words=max_words, with_audio=with_audio
        )

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


def run_import_words(files: list[Path]) -> int:
    paths = files or sorted(DEFAULT_DICTIONARY_DIR.glob("dictionary-*.json"))
    if not paths:
        print(f"No dictionary files found in {DEFAULT_DICTIONARY_DIR}")
        return 1
    failed = False
    for result in import_word_files(paths, get_session_factory()):
        if result.error:
            failed = True
            print(f"{result.path.name}: FAILED: {result.error}")
            continue
        print(f"{result.path.name} ({result.pair}): {result.parsed} pairs read, {result.inserted} new")
        for issue in result.issues[:5]:
            print(f"  issue ({issue.record_id}): {issue.reason}")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    args = build_parser().parse_args(argv)
    if args.command == "import":
        return run_import(args.source, args.targets, args.pages, args.max_words, args.with_audio)
    if args.command == "import-words":
        return run_import_words(args.files)
    return 2


if __name__ == "__main__":
    sys.exit(main())
