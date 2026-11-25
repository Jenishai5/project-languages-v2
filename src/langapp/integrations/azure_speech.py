import base64
import json
import logging

import httpx

from langapp.domain import PronunciationScore, SoundScore, WordScore
from langapp.errors import ExternalSourceError, UpstreamRateLimited

logger = logging.getLogger(__name__)

NO_SPEECH = {"NoMatch", "InitialSilenceTimeout", "BabbleTimeout"}


class AzureSpeechError(ExternalSourceError):
    pass


def assessment_header(reference_text: str, locale: str) -> str:
    config = {
        "ReferenceText": reference_text,
        "GradingSystem": "HundredMark",
        "Granularity": "Phoneme",
        "Dimension": "Comprehensive",
        "EnableMiscue": True,
    }
    if locale == "en-US":
        config["PhonemeAlphabet"] = "IPA"
    return base64.b64encode(json.dumps(config, ensure_ascii=False).encode("utf-8")).decode("ascii")


def _scores(item: dict) -> dict:
    nested = item.get("PronunciationAssessment")
    return nested if isinstance(nested, dict) else item


def _number(value: object) -> float:
    return round(float(value), 1) if isinstance(value, int | float) else 0.0


def parse_assessment(payload: dict) -> PronunciationScore | None:
    if payload.get("RecognitionStatus") in NO_SPEECH:
        return None
    if payload.get("RecognitionStatus") != "Success" or not payload.get("NBest"):
        raise AzureSpeechError(f"Azure could not score the audio ({payload.get('RecognitionStatus')}).")

    best = payload["NBest"][0]
    overall = _scores(best)
    words = []
    for item in best.get("Words") or []:
        scores = _scores(item)
        sounds = tuple(
            SoundScore(sound=str(p.get("Phoneme", "")), accuracy=_number(_scores(p).get("AccuracyScore")))
            for p in item.get("Phonemes") or []
            if p.get("Phoneme")
        )
        words.append(
            WordScore(
                word=str(item.get("Word", "")),
                accuracy=_number(scores.get("AccuracyScore")),
                error=str(scores.get("ErrorType", "None")),
                sounds=sounds,
            )
        )
    return PronunciationScore(
        recognized=str(best.get("Display") or payload.get("DisplayText") or ""),
        pronunciation=_number(overall.get("PronScore")),
        accuracy=_number(overall.get("AccuracyScore")),
        fluency=_number(overall.get("FluencyScore")),
        completeness=_number(overall.get("CompletenessScore")),
        words=tuple(words),
    )


class AzureSpeechClient:
    def __init__(
        self,
        key: str,
        region: str,
        timeout_seconds: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._url = f"https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"
        self._http = httpx.Client(timeout=timeout_seconds, transport=transport, headers={"Ocp-Apim-Subscription-Key": key})

    def close(self) -> None:
        self._http.close()

    def assess(self, audio: bytes, reference_text: str, locale: str) -> PronunciationScore | None:
        try:
            response = self._http.post(
                self._url,
                params={"language": locale, "format": "detailed"},
                content=audio,
                headers={
                    "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
                    "Accept": "application/json",
                    "Pronunciation-Assessment": assessment_header(reference_text, locale),
                },
            )
        except httpx.TransportError as exc:
            raise AzureSpeechError("Could not reach Azure Speech.") from exc

        if response.status_code == 429:
            raise UpstreamRateLimited("Azure Speech is busy or this month's free hours are used up. Try again later.")
        if response.status_code in (401, 403):
            logger.warning("Azure Speech refused the key (%s)", response.status_code)
            raise AzureSpeechError("Azure Speech refused the key. Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.")
        if response.status_code != 200:
            logger.warning("Azure Speech failed with %s: %s", response.status_code, response.text[:300])
            raise AzureSpeechError(f"Azure Speech request failed ({response.status_code}).")
        try:
            payload = response.json()
        except ValueError as exc:
            raise AzureSpeechError("Azure Speech sent a reply that is not JSON.") from exc
        return parse_assessment(payload)
