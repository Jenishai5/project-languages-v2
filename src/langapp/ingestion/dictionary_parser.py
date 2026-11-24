import json
import re
from pathlib import Path

from pydantic import ValidationError

from langapp.domain import ParsedWordPair
from langapp.ingestion.parser import ParseIssue, describe

FILE_NAME_PATTERN = re.compile(r"^dictionary-(?P<pair>[a-z]{2,3}-[a-z]{2,10})\.json$")


class DictionaryFileError(Exception):
    pass


def pair_from_file_name(path: Path) -> str:
    match = FILE_NAME_PATTERN.match(path.name)
    if match is None:
        raise DictionaryFileError(f"{path.name}: expected a name like dictionary-en-es.json")
    return match.group("pair")


def parse_dictionary(payload: object, pair: str) -> tuple[list[ParsedWordPair], list[ParseIssue]]:
    if not isinstance(payload, dict):
        raise DictionaryFileError("dictionary must be a JSON object of categories")

    pairs: list[ParsedWordPair] = []
    issues: list[ParseIssue] = []
    seen: set[tuple[str, str]] = set()
    for category, words in payload.items():
        if not isinstance(words, dict):
            issues.append(ParseIssue(category, "category is not an object of word pairs, ignored"))
            continue
        for source, target in words.items():
            try:
                word_pair = ParsedWordPair(pair=pair, category=category, source_text=source, target_text=target)
            except ValidationError as exc:
                issues.append(ParseIssue(source, describe(exc)))
                continue
            key = (word_pair.source_text.lower(), word_pair.target_text.lower())
            if key in seen:
                continue
            seen.add(key)
            pairs.append(word_pair)
    return pairs, issues


def load_dictionary_file(path: Path) -> tuple[list[ParsedWordPair], list[ParseIssue]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DictionaryFileError(f"{path.name}: cannot read JSON ({exc})") from exc
    return parse_dictionary(payload, pair_from_file_name(path))
