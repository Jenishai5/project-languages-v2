from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session, sessionmaker

from langapp.ingestion.dictionary_parser import DictionaryFileError, load_dictionary_file
from langapp.ingestion.parser import ParseIssue
from langapp.repositories.word_pairs import WordPairRepository


@dataclass
class WordFileResult:
    path: Path
    pair: str | None = None
    parsed: int = 0
    inserted: int = 0
    issues: list[ParseIssue] = field(default_factory=list)
    error: str | None = None


def import_word_files(paths: Sequence[Path], session_factory: sessionmaker[Session]) -> list[WordFileResult]:
    results = []
    for path in paths:
        result = WordFileResult(path=path)
        try:
            pairs, issues = load_dictionary_file(path)
        except DictionaryFileError as exc:
            result.error = str(exc)
            results.append(result)
            continue
        result.issues = issues
        result.parsed = len(pairs)
        result.pair = pairs[0].pair if pairs else None
        with session_factory.begin() as session:
            result.inserted = WordPairRepository(session).upsert_many(pairs)
        results.append(result)
    return results
