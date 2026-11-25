import json
from collections.abc import Sequence
from dataclasses import dataclass, field

from langapp.errors import ExternalSourceError, UpstreamRateLimited
from langapp.services.agents.base import LearnerContext, clip, json_object
from langapp.services.ports import JsonChatModel

AGENT = "grammar"
MAX_MISTAKES = 3


@dataclass(frozen=True)
class Mistake:
    wrong: str
    right: str
    why: str


@dataclass(frozen=True)
class GrammarFeedback:
    explanation: str
    mistakes: tuple[Mistake, ...] = ()
    tip: str | None = None
    model: str | None = None
    tokens: int | None = field(default=None, compare=False)

    def mistakes_view(self) -> list[dict]:
        return [{"wrong": m.wrong, "right": m.right, "why": m.why} for m in self.mistakes]


def build_messages(context: LearnerContext, target: str, answer: str, meaning: str | None) -> list[dict]:
    system = (
        f"You are a kind {context.learning_name} grammar teacher. "
        f"Your student is at level {context.level} and their native language is {context.native_name}. "
        "The student put word tiles in order to build a sentence, and the order is wrong. "
        f"Explain in simple {context.native_name}, in at most three short sentences, why their order is wrong "
        "and which grammar rule decides the order. Be encouraging. Do not invent words that are not in the sentence. "
        "Reply with JSON only, without markdown, in exactly this shape: "
        '{"explanation": "...", "mistakes": [{"wrong": "...", "right": "...", "why": "..."}], "tip": "..."}. '
        f"Use at most {MAX_MISTAKES} mistakes. The tip is one short sentence that helps next time."
    )
    student = {"correct_sentence": target, "student_answer": answer}
    if meaning:
        student["meaning"] = meaning
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(student, ensure_ascii=False)},
    ]


def parse_feedback(text: str, model: str | None = None, tokens: int | None = None) -> GrammarFeedback:
    data = json_object(text)
    if data is None:
        return GrammarFeedback(explanation=clip(text, 600), model=model, tokens=tokens)

    mistakes = []
    for item in data.get("mistakes") or []:
        if not isinstance(item, dict):
            continue
        mistake = Mistake(clip(item.get("wrong"), 120), clip(item.get("right"), 120), clip(item.get("why"), 300))
        if mistake.wrong or mistake.right or mistake.why:
            mistakes.append(mistake)

    return GrammarFeedback(
        explanation=clip(data.get("explanation"), 600),
        mistakes=tuple(mistakes[:MAX_MISTAKES]),
        tip=clip(data.get("tip"), 200) or None,
        model=model,
        tokens=tokens,
    )


class GrammarAgent:
    name = AGENT

    def __init__(self, model: JsonChatModel, models: Sequence[str], max_tokens: int = 2000, attempts: int = 2) -> None:
        self._model = model
        self._models = tuple(models)
        self._max_tokens = max_tokens
        self._attempts = max(1, attempts)

    @property
    def primary_model(self) -> str:
        return self._models[0] if self._models else "unknown"

    def explain(self, context: LearnerContext, target: str, answer: str, meaning: str | None) -> GrammarFeedback:
        messages = build_messages(context, target, answer, meaning)
        for attempt in range(self._attempts):
            try:
                reply = self._model.chat_json(self._models, messages, user=str(context.user_id), max_tokens=self._max_tokens)
            except UpstreamRateLimited:
                raise
            except ExternalSourceError:
                if attempt + 1 >= self._attempts:
                    raise
                continue
            feedback = parse_feedback(reply.text, reply.model, reply.tokens)
            if feedback.explanation or attempt + 1 >= self._attempts:
                return feedback
        raise ExternalSourceError("The AI teacher gave no answer.")
