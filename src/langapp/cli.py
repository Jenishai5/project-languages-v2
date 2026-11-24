import argparse
import logging
import sys
from pathlib import Path

from langapp.config import get_settings
from langapp.db.session import get_session_factory
from langapp.ingestion.tatoeba_client import TatoebaClient
from langapp.repositories.lessons import LessonRepository
from langapp.services.import_service import SentenceImporter
from langapp.services.lesson_builder import LessonSentenceBuilder, import_concepts
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

    concepts = commands.add_parser("import-concepts", help="Build concepts and lessons from the dictionary files")
    concepts.add_argument("--words-per-lesson", type=int, default=10)

    lessons = commands.add_parser("build-lessons", help="Find Tatoeba sentences for the lesson words")
    lessons.add_argument("--learning", default="eng", help="language being learned (ISO 639-3)")
    lessons.add_argument("--natives", nargs="+", default=["spa", "rus"], help="native languages to translate into")
    lessons.add_argument("--lessons", type=int, default=5, help="fill the first N lessons (0 = all)")
    lessons.add_argument("--per-word", type=int, default=2, help="sentences per word")

    image = commands.add_parser("set-image", help="Attach a picture to a word (e.g. after reviewing an AI image)")
    image.add_argument("slug", help="concept slug, e.g. doctor")
    image.add_argument("url", help="where the image is stored")
    image.add_argument("--approve", action="store_true", help="show it to learners")
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


def make_client() -> TatoebaClient:
    settings = get_settings()
    return TatoebaClient(
        base_url=settings.tatoeba_base_url,
        timeout_seconds=settings.tatoeba_timeout_seconds,
        max_retries=settings.tatoeba_max_retries,
        min_interval_seconds=settings.tatoeba_min_interval_seconds,
        user_agent=settings.tatoeba_user_agent,
    )


def run_import_concepts(words_per_lesson: int) -> int:
    paths = sorted(DEFAULT_DICTIONARY_DIR.glob("dictionary-*.json"))
    if not paths:
        print(f"No dictionary files found in {DEFAULT_DICTIONARY_DIR}")
        return 1
    summary = import_concepts(paths, get_session_factory(), words_per_lesson)
    print(f"{summary.concepts} concepts, {summary.lessons} lessons")
    return 0


def run_build_lessons(learning: str, natives: list[str], lessons: int, per_word: int) -> int:
    with make_client() as client:
        summary = LessonSentenceBuilder(client, get_session_factory(), per_word=per_word).build(
            learning, natives, lessons or None
        )
    print(
        f"{summary.words} words checked, {summary.words_with_sentences} got sentences, "
        f"{summary.sentences_linked} new lesson sentences"
    )
    if summary.missed:
        print(f"  no good sentence for: {', '.join(summary.missed[:20])}")
    if summary.failed:
        print(f"  failed (Tatoeba error): {', '.join(summary.failed[:20])}")
    return 1 if summary.failed and not summary.words_with_sentences else 0


def run_set_image(slug: str, url: str, approve: bool) -> int:
    with get_session_factory().begin() as session:
        found = LessonRepository(session).set_image(slug, url, approve)
    if not found:
        print(f"No concept called '{slug}'")
        return 1
    print(f"{slug}: image saved ({'approved' if approve else 'waiting for approval'})")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    args = build_parser().parse_args(argv)
    if args.command == "import":
        return run_import(args.source, args.targets, args.pages, args.max_words, args.with_audio)
    if args.command == "import-words":
        return run_import_words(args.files)
    if args.command == "import-concepts":
        return run_import_concepts(args.words_per_lesson)
    if args.command == "build-lessons":
        return run_build_lessons(args.learning, args.natives, args.lessons, args.per_word)
    if args.command == "set-image":
        return run_set_image(args.slug, args.url, args.approve)
    return 2


if __name__ == "__main__":
    sys.exit(main())
