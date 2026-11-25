import json
from collections.abc import Sequence
from dataclasses import dataclass, field

from langapp.services.agents.base import LearnerContext, ask_with_retry, clip, json_object
from langapp.services.ports import JsonChatModel

AGENT = "cultural"
MAX_EXPRESSIONS = 3


@dataclass(frozen=True)
class Expression:
    phrase: str
    meaning: str


@dataclass(frozen=True)
class CultureNote:
    note: str
    expressions: tuple[Expression, ...] = ()
    fun_fact: str | None = None
    model: str | None = None
    tokens: int | None = field(default=None, compare=False)

    def view(self) -> dict:
        return {
            "note": self.note,
            "expressions": [{"phrase": e.phrase, "meaning": e.meaning} for e in self.expressions],
            "fun_fact": self.fun_fact,
        }


def build_messages(context: LearnerContext, word: str, translation: str) -> list[dict]:
    system = (
        f"You explain the culture behind {context.learning_name} words to a student "
        f"at level {context.level} whose native language is {context.native_name}. "
        f"Write in simple {context.native_name}. "
        f"In two or three short sentences, explain how native speakers really use this word in everyday life: "
        "when it sounds natural, formal or informal, and any cultural habit linked to it. "
        f"Then give up to {MAX_EXPRESSIONS} common idioms or natural expressions in {context.learning_name} that use the word, "
        f"each with its meaning in {context.native_name}. Only real, common expressions; an empty list is fine. "
        "Add one short fun fact if you know a true one, otherwise null. Never invent facts. "
        "Reply with JSON only, without markdown, in exactly this shape: "
        '{"note": "...", "expressions": [{"phrase": "...", "meaning": "..."}], "fun_fact": "..."}.'
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"word": word, "meaning": translation}, ensure_ascii=False)},
    ]


def parse_note(text: str, model: str | None = None, tokens: int | None = None) -> CultureNote:
    data = json_object(text)
    if data is None:
        return CultureNote(note=clip(text, 700), model=model, tokens=tokens)

    expressions = []
    for item in data.get("expressions") or []:
        if isinstance(item, dict):
            expression = Expression(clip(item.get("phrase"), 120), clip(item.get("meaning"), 200))
            if expression.phrase:
                expressions.append(expression)
    return CultureNote(
        note=clip(data.get("note"), 700),
        expressions=tuple(expressions[:MAX_EXPRESSIONS]),
        fun_fact=clip(data.get("fun_fact"), 300) or None,
        model=model,
        tokens=tokens,
    )


class CulturalAgent:
    name = AGENT

    def __init__(self, model: JsonChatModel, models: Sequence[str], max_tokens: int = 2000, attempts: int = 2) -> None:
        self._model = model
        self._models = tuple(models)
        self._max_tokens = max_tokens
        self._attempts = max(1, attempts)

    @property
    def primary_model(self) -> str:
        return self._models[0] if self._models else "unknown"

    def explain(self, context: LearnerContext, word: str, translation: str) -> CultureNote:
        return ask_with_retry(
            self._model,
            self._models,
            build_messages(context, word, translation),
            str(context.user_id),
            self._max_tokens,
            self._attempts,
            parse_note,
            lambda note: bool(note.note),
        )
