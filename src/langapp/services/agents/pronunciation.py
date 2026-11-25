import uuid
from dataclasses import dataclass

from langapp.domain import PronunciationScore
from langapp.errors import InvalidRequest
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.services.agents.orchestrator import AgentOrchestrator
from langapp.services.ports import PronunciationScorer

AGENT = "pronunciation"
MODEL = "azure-speech"
LOCALES = {"eng": "en-US", "spa": "es-ES", "cat": "ca-ES"}
MAX_AUDIO_BYTES = 2_000_000
MIN_AUDIO_BYTES = 1_000
WEAK = 60.0


@dataclass(frozen=True)
class PronunciationResult:
    score: PronunciationScore | None
    model: str = MODEL
    tokens: int | None = None


class PronunciationAgent:
    name = AGENT
    primary_model = MODEL

    def __init__(self, scorer: PronunciationScorer) -> None:
        self._scorer = scorer

    def assess(self, audio: bytes, text: str, locale: str) -> PronunciationResult:
        return PronunciationResult(score=self._scorer.assess(audio, text, locale))


def is_wav(audio: bytes) -> bool:
    return len(audio) >= 12 and audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"


def verdict(score: float) -> str:
    if score >= 85:
        return "Excellent! You sound very natural."
    if score >= 65:
        return "Good! Listen again and copy the sounds marked in pink."
    return "Keep practising: listen first, then say it slowly."


def weak_sounds(score: PronunciationScore, limit: int = 3) -> list[str]:
    found = sorted(
        (sound for word in score.words for sound in word.sounds if sound.accuracy < WEAK),
        key=lambda sound: sound.accuracy,
    )
    return list(dict.fromkeys(sound.sound for sound in found))[:limit]


class PronunciationService:
    def __init__(
        self,
        orchestrator: AgentOrchestrator,
        agent: PronunciationAgent | None,
        outcomes: LearningOutcomeRepository,
    ) -> None:
        self._orchestrator = orchestrator
        self._agent = agent
        self._outcomes = outcomes

    def supports(self, learning: str) -> bool:
        return self._agent is not None and learning in LOCALES

    def assess(self, user_id: uuid.UUID, learning: str, text: str, audio: bytes) -> dict:
        reference = " ".join(text.split())
        if not reference:
            raise InvalidRequest("Say which word you practise.")
        if learning not in LOCALES:
            return self._view(user_id, reference, message="Pronunciation scores are not available for this language yet.")
        if not (MIN_AUDIO_BYTES <= len(audio) <= MAX_AUDIO_BYTES) or not is_wav(audio):
            raise InvalidRequest("Send a short WAV recording (up to about a minute).")

        context = self._orchestrator.learner(user_id, learning, learning)
        answer = self._orchestrator.ask(
            context,
            AGENT,
            self._agent,
            None,
            lambda agent: agent.assess(audio, reference, LOCALES[learning]),
            lambda result: True,
        )
        result = answer.value if isinstance(answer.value, PronunciationResult) else None
        if result is None:
            return self._view(user_id, reference, message=answer.message)
        if result.score is None:
            return self._view(user_id, reference, available=True, message="I didn't hear anything. Try again a bit louder.")
        if result.score.words and all(word.error == "Omission" for word in result.score.words):
            message = "I couldn't hear the word. Try again closer to the microphone."
            return self._view(user_id, reference, available=True, message=message)

        score = result.score
        self._outcomes.add(
            user_id,
            agent=AGENT,
            kind="pronunciation",
            model=MODEL,
            detail={"text": reference, "score": score.pronunciation, "weak_sounds": weak_sounds(score)},
        )
        return self._view(user_id, reference, available=True, score=score)

    def _view(
        self,
        user_id: uuid.UUID,
        text: str,
        available: bool = False,
        score: PronunciationScore | None = None,
        message: str | None = None,
    ) -> dict:
        return {
            "available": available,
            "heard": score is not None,
            "text": text,
            "recognized": score.recognized if score else None,
            "pronunciation": score.pronunciation if score else None,
            "accuracy": score.accuracy if score else None,
            "fluency": score.fluency if score else None,
            "completeness": score.completeness if score else None,
            "words": [{"word": w.word, "accuracy": w.accuracy, "error": w.error} for w in score.words] if score else [],
            "weak_sounds": weak_sounds(score) if score else [],
            "verdict": verdict(score.pronunciation) if score else None,
            "message": message,
            "remaining_today": self._orchestrator.remaining_today(user_id),
        }
