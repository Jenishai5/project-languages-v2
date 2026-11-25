import json
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from langapp.errors import ExternalSourceError, UpstreamRateLimited
from langapp.services.languages import LANGUAGE_NAMES
from langapp.services.ports import JsonChatModel

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
DEFAULT_LEVEL = "A1"


@dataclass(frozen=True)
class LearnerContext:
    user_id: uuid.UUID
    learning: str
    native: str
    level: str = DEFAULT_LEVEL

    @property
    def learning_name(self) -> str:
        return LANGUAGE_NAMES.get(self.learning, self.learning)

    @property
    def native_name(self) -> str:
        return LANGUAGE_NAMES.get(self.native, self.native)


def model_list(configured: str, fallback: str) -> tuple[str, ...]:
    names = tuple(name.strip() for name in configured.split(",") if name.strip())
    return names or ((fallback,) if fallback else ())


def clip(value: object, limit: int) -> str:
    return str(value).strip()[:limit] if isinstance(value, str | int | float) else ""


def json_object(text: str) -> dict | None:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


T = TypeVar("T")


def ask_with_retry(
    model: JsonChatModel,
    models: Sequence[str],
    messages: list[dict],
    user: str,
    max_tokens: int,
    attempts: int,
    parse: Callable[[str, str | None, int | None], T],
    usable: Callable[[T], bool],
) -> T:
    for attempt in range(max(1, attempts)):
        last = attempt + 1 >= max(1, attempts)
        try:
            reply = model.chat_json(models, messages, user=user, max_tokens=max_tokens)
        except UpstreamRateLimited:
            raise
        except ExternalSourceError:
            if last:
                raise
            continue
        result = parse(reply.text, reply.model, reply.tokens)
        if usable(result) or last:
            return result
    raise ExternalSourceError("The AI teacher gave no answer.")
