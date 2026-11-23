from dataclasses import dataclass, field

from pydantic import ValidationError

from langapp.domain import ParsedSentence, ParsedTranslation


class ParsePageError(Exception):
    pass


@dataclass(frozen=True)
class ParseIssue:
    record_id: object
    reason: str


@dataclass
class ParseResult:
    sentences: list[ParsedSentence] = field(default_factory=list)
    issues: list[ParseIssue] = field(default_factory=list)


def _describe(exc: ValidationError) -> str:
    parts = []
    for error in exc.errors():
        location = ".".join(str(item) for item in error["loc"]) or "record"
        parts.append(f"{location}: {error['msg']}")
    return "; ".join(parts)


def _parse_translations(record_id: object, raw: object, issues: list[ParseIssue]) -> list[ParsedTranslation]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        issues.append(ParseIssue(record_id, "translations is not a list, ignored"))
        return []

    translations: list[ParsedTranslation] = []
    seen: set[int] = set()
    for item in raw:
        try:
            translation = ParsedTranslation.model_validate(item)
        except ValidationError as exc:
            issues.append(ParseIssue(record_id, f"translation skipped: {_describe(exc)}"))
            continue
        if translation.id in seen or translation.id == record_id:
            continue
        seen.add(translation.id)
        translations.append(translation)
    return translations


def parse_sentence(raw: object, issues: list[ParseIssue]) -> ParsedSentence | None:
    if not isinstance(raw, dict):
        issues.append(ParseIssue(None, "record is not a JSON object"))
        return None

    record_id = raw.get("id")
    translations = _parse_translations(record_id, raw.get("translations"), issues)
    try:
        return ParsedSentence.model_validate({**raw, "translations": translations})
    except ValidationError as exc:
        issues.append(ParseIssue(record_id, _describe(exc)))
        return None


def parse_page(payload: object) -> ParseResult:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ParsePageError("response has no 'data' list")

    result = ParseResult()
    seen: set[int] = set()
    for raw in payload["data"]:
        sentence = parse_sentence(raw, result.issues)
        if sentence is None or sentence.id in seen:
            continue
        seen.add(sentence.id)
        result.sentences.append(sentence)
    return result
