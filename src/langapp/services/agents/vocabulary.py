import json
from collections.abc import Sequence
from dataclasses import dataclass, field

from langapp.errors import ExternalSourceError, UpstreamRateLimited
from langapp.services.agents.base import LearnerContext, clip, json_object
from langapp.services.ports import JsonChatModel

AGENT = "vocabulary"
MAX_EXAMPLES = 3
MAX_WORDS = 3


@dataclass(frozen=True)
class Example:
    sentence: str
    translation: str


@dataclass(frozen=True)
class WordHelp:
    examples: tuple[Example, ...] = ()
    synonyms: tuple[str, ...] = ()
    antonyms: tuple[str, ...] = ()
    tip: str | None = None
    model: str | None = None
    tokens: int | None = field(default=None, compare=False)

    @property
    def useful(self) -> bool:
        return bool(self.examples or self.tip)

    def view(self) -> dict:
        return {
            "examples": [{"sentence": e.sentence, "translation": e.translation} for e in self.examples],
            "synonyms": list(self.synonyms),
            "antonyms": list(self.antonyms),
            "tip": self.tip,
        }


def build_messages(context: LearnerContext, word: str, translation: str) -> list[dict]:
    system = (
        f"You are a kind {context.learning_name} vocabulary teacher. "
        f"Your student is at level {context.level} and their native language is {context.native_name}. "
        f"Help them remember one {context.learning_name} word. "
        f"Write {MAX_EXAMPLES} short, natural example sentences in {context.learning_name} that use the word, "
        f"each with its {context.native_name} translation. Use only easy words for level {context.level}. "
        f"Give up to {MAX_WORDS} common synonyms and up to {MAX_WORDS} antonyms in {context.learning_name} "
        "(an empty list when there are none; never invent rare words). "
        f"Finish with one short memory tip in {context.native_name}. "
        "Reply with JSON only, without markdown, in exactly this shape: "
        '{"examples": [{"sentence": "...", "translation": "..."}], "synonyms": ["..."], "antonyms": ["..."], "tip": "..."}.'
    )
    student = {"word": word, "meaning": translation}
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(student, ensure_ascii=False)},
    ]


def _words(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    cleaned = [clip(item, 40) for item in value]
    return tuple(dict.fromkeys(word for word in cleaned if word))[:MAX_WORDS]


def parse_word_help(text: str, model: str | None = None, tokens: int | None = None) -> WordHelp:
    data = json_object(text)
    if data is None:
        return WordHelp(tip=clip(text, 300) or None, model=model, tokens=tokens)

    examples = []
    for item in data.get("examples") or []:
        if isinstance(item, dict):
            example = Example(clip(item.get("sentence"), 200), clip(item.get("translation"), 200))
            if example.sentence:
                examples.append(example)

    return WordHelp(
        examples=tuple(examples[:MAX_EXAMPLES]),
        synonyms=_words(data.get("synonyms")),
        antonyms=_words(data.get("antonyms")),
        tip=clip(data.get("tip"), 300) or None,
        model=model,
        tokens=tokens,
    )


class VocabularyAgent:
    name = AGENT

    def __init__(self, model: JsonChatModel, models: Sequence[str], max_tokens: int = 2000, attempts: int = 2) -> None:
        self._model = model
        self._models = tuple(models)
        self._max_tokens = max_tokens
        self._attempts = max(1, attempts)

    @property
    def primary_model(self) -> str:
        return self._models[0] if self._models else "unknown"

    def help(self, context: LearnerContext, word: str, translation: str) -> WordHelp:
        messages = build_messages(context, word, translation)
        for attempt in range(self._attempts):
            try:
                reply = self._model.chat_json(self._models, messages, user=str(context.user_id), max_tokens=self._max_tokens)
            except UpstreamRateLimited:
                raise
            except ExternalSourceError:
                if attempt + 1 >= self._attempts:
                    raise
                continue
            result = parse_word_help(reply.text, reply.model, reply.tokens)
            if result.useful or attempt + 1 >= self._attempts:
                return result
        raise ExternalSourceError("The AI teacher gave no answer.")
