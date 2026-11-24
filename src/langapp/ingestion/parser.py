from dataclasses import dataclass, field

from pydantic import ValidationError

from langapp.domain import ParsedAudio, ParsedSentence, ParsedTranslation


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


def describe(exc: ValidationError) -> str:
    parts = []
    for error in exc.errors():
        location = ".".join(str(item) for item in error["loc"]) or "record"
        parts.append(f"{location}: {error['msg']}")
    return "; ".join(parts)


def _parse_audios(record_id: object, raw: object, issues: list[ParseIssue]) -> list[ParsedAudio]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        issues.append(ParseIssue(record_id, "audios is not a list, ignored"))
        return []

    audios: list[ParsedAudio] = []
    seen: set[int] = set()
    for item in raw:
        try:
            audio = ParsedAudio.model_validate(item)
        except ValidationError as exc:
            issues.append(ParseIssue(record_id, f"audio skipped: {describe(exc)}"))
            continue
        if audio.id not in seen:
            seen.add(audio.id)
            audios.append(audio)
    return audios


def _parse_translations(record_id: object, raw: object, issues: list[ParseIssue]) -> list[ParsedTranslation]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        issues.append(ParseIssue(record_id, "translations is not a list, ignored"))
        return []

    translations: list[ParsedTranslation] = []
    seen: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            issues.append(ParseIssue(record_id, "translation skipped: not a JSON object"))
            continue
        audios = _parse_audios(item.get("id"), item.get("audios"), issues)
        try:
            translation = ParsedTranslation.model_validate({**item, "audios": audios})
        except ValidationError as exc:
            issues.append(ParseIssue(record_id, f"translation skipped: {describe(exc)}"))
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
    audios = _parse_audios(record_id, raw.get("audios"), issues)
    try:
        return ParsedSentence.model_validate({**raw, "translations": translations, "audios": audios})
    except ValidationError as exc:
        issues.append(ParseIssue(record_id, describe(exc)))
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
