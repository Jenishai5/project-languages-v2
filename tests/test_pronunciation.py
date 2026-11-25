import base64
import json
import struct
import threading
from datetime import UTC, datetime

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from langapp.api.deps import get_pronunciation_agent, get_session, get_token_verifier
from langapp.api.main import app
from langapp.domain import PronunciationScore, SoundScore, WordScore
from langapp.errors import InvalidRequest
from langapp.integrations.azure_speech import AzureSpeechClient, AzureSpeechError, assessment_header, parse_assessment
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from langapp.services.agents.pronunciation import PronunciationAgent, PronunciationService, verdict, weak_sounds
from tests.test_lessons import USER, FakeVerifier

AUTH = {"Authorization": "Bearer good-token"}
URL = "https://swedencentral.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"
FLAT = {
    "RecognitionStatus": "Success",
    "DisplayText": "Doctor.",
    "NBest": [
        {
            "Display": "Doctor.",
            "AccuracyScore": 72.0,
            "FluencyScore": 90.0,
            "CompletenessScore": 100.0,
            "PronScore": 80.4,
            "Words": [
                {
                    "Word": "doctor",
                    "AccuracyScore": 72.0,
                    "ErrorType": "None",
                    "Phonemes": [{"Phoneme": "d", "AccuracyScore": 95}, {"Phoneme": "ɒ", "AccuracyScore": 40}],
                }
            ],
        }
    ],
}
NESTED = {
    "RecognitionStatus": "Success",
    "NBest": [
        {
            "Display": "Hola.",
            "PronunciationAssessment": {"AccuracyScore": 90, "FluencyScore": 88, "CompletenessScore": 100, "PronScore": 91},
            "Words": [{"Word": "hola", "PronunciationAssessment": {"AccuracyScore": 90, "ErrorType": "None"}}],
        }
    ],
}


def wav(seconds: float = 0.5) -> bytes:
    samples = int(16000 * seconds)
    data = b"\x00\x00" * samples
    fields = (b"RIFF", 36 + len(data), b"WAVE", b"fmt ", 16, 1, 1, 16000, 32000, 2, 16, b"data", len(data))
    header = struct.pack("<4sI4s4sIHHIIHH4sI", *fields)
    return header + data


class FakeScorer:
    def __init__(self, score: PronunciationScore | None) -> None:
        self.score = score
        self.calls: list[tuple[str, str]] = []

    def assess(self, audio, reference_text, locale):
        self.calls.append((reference_text, locale))
        return self.score


SCORE = PronunciationScore(
    recognized="Doctor.",
    pronunciation=80.4,
    accuracy=72.0,
    fluency=90.0,
    completeness=100.0,
    words=(WordScore("doctor", 72.0, "None", (SoundScore("d", 95), SoundScore("ɒ", 40))),),
)


def make_service(session, scorer) -> PronunciationService:
    orchestrator = AgentOrchestrator(
        SentenceRepository(session),
        ConceptRepository(session),
        UserSettingsRepository(session),
        LearningOutcomeRepository(session),
        AiUsageRepository(session),
        grammar=None,
        vocabulary=None,
        cache=ReplyCache(),
        gate=threading.BoundedSemaphore(2),
        limits=AgentLimits(daily_limit=5, wait_seconds=0.01),
        clock=lambda: datetime.now(UTC),
    )
    return PronunciationService(orchestrator, PronunciationAgent(scorer) if scorer else None, LearningOutcomeRepository(session))


def test_header_carries_the_reference_text_and_ipa_for_english():
    config = json.loads(base64.b64decode(assessment_header("doctor", "en-US")))
    assert config["ReferenceText"] == "doctor" and config["Granularity"] == "Phoneme"
    assert config["PhonemeAlphabet"] == "IPA"
    assert "PhonemeAlphabet" not in json.loads(base64.b64decode(assessment_header("hola", "es-ES")))


def test_parse_reads_flat_and_nested_replies():
    flat, nested = parse_assessment(FLAT), parse_assessment(NESTED)
    assert (flat.pronunciation, flat.accuracy, flat.words[0].sounds[1]) == (80.4, 72.0, SoundScore("ɒ", 40.0))
    assert (nested.pronunciation, nested.words[0].accuracy, nested.recognized) == (91.0, 90.0, "Hola.")
    assert parse_assessment({"RecognitionStatus": "InitialSilenceTimeout"}) is None
    with pytest.raises(AzureSpeechError):
        parse_assessment({"RecognitionStatus": "Error"})


@respx.mock
def test_client_sends_audio_to_the_region_with_the_key():
    route = respx.post(URL).mock(return_value=httpx.Response(200, json=FLAT))
    client = AzureSpeechClient("secret-key", "swedencentral")

    score = client.assess(wav(), "doctor", "en-US")

    request = route.calls.last.request
    assert request.headers["Ocp-Apim-Subscription-Key"] == "secret-key"
    assert request.url.params["language"] == "en-US" and request.headers["Content-Type"].startswith("audio/wav")
    assert score.pronunciation == 80.4


@respx.mock
def test_client_explains_a_wrong_key():
    respx.post(URL).mock(return_value=httpx.Response(401))
    with pytest.raises(AzureSpeechError, match="AZURE_SPEECH_KEY"):
        AzureSpeechClient("bad", "swedencentral").assess(wav(), "doctor", "en-US")


def test_verdict_and_weak_sounds():
    assert verdict(90).startswith("Excellent") and verdict(70).startswith("Good") and verdict(40).startswith("Keep")
    assert weak_sounds(SCORE) == ["ɒ"]


def test_assess_scores_saves_the_outcome_and_counts_usage(session_factory):
    scorer = FakeScorer(SCORE)
    with session_factory.begin() as session:
        result = make_service(session, scorer).assess(USER.id, "eng", " doctor ", wav())

    assert result["available"] and result["heard"] and result["pronunciation"] == 80.4
    assert result["weak_sounds"] == ["ɒ"] and result["remaining_today"] == 4
    assert scorer.calls == [("doctor", "en-US")]
    with session_factory() as session:
        outcome = LearningOutcomeRepository(session).recent_for_user(USER.id)[0]
    assert (outcome.kind, outcome.detail["score"]) == ("pronunciation", 80.4)


def test_silence_and_unsupported_language_are_answered_kindly(session_factory):
    with session_factory.begin() as session:
        silent = make_service(session, FakeScorer(None)).assess(USER.id, "spa", "hola", wav())
        russian = make_service(session, FakeScorer(SCORE)).assess(USER.id, "rus", "привет", wav())
        missing = make_service(session, None).assess(USER.id, "eng", "doctor", wav())

    assert silent["available"] and not silent["heard"] and "didn't hear" in silent["message"]
    assert not russian["available"] and "not available" in russian["message"]
    assert not missing["available"] and "not set up" in missing["message"]


def test_all_words_missing_counts_as_not_heard(session_factory):
    missed = PronunciationScore(".", 0, 0, 0, 0, (WordScore("hello", 0, "Omission"),))
    with session_factory.begin() as session:
        result = make_service(session, FakeScorer(missed)).assess(USER.id, "eng", "hello", wav())
    assert result["available"] and not result["heard"] and "couldn't hear the word" in result["message"]
    with session_factory() as session:
        assert LearningOutcomeRepository(session).recent_for_user(USER.id) == []


def test_not_a_wav_file_is_refused(session_factory):
    with session_factory.begin() as session, pytest.raises(InvalidRequest):
        make_service(session, FakeScorer(SCORE)).assess(USER.id, "eng", "doctor", b"not audio" * 200)


@pytest.fixture
def api(session_factory):
    def override_session():
        with session_factory.begin() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier()
    app.dependency_overrides[get_pronunciation_agent] = lambda: PronunciationAgent(FakeScorer(SCORE))
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_endpoint_takes_raw_wav_audio(api):
    response = api.post(
        "/agents/pronunciation/assess",
        params={"learning": "eng", "text": "doctor"},
        content=wav(),
        headers={**AUTH, "Content-Type": "audio/wav"},
    )
    support = api.get("/agents/pronunciation/support", params={"learning": "cat"}, headers=AUTH)

    assert response.status_code == 200 and response.json()["words"][0]["word"] == "doctor"
    assert support.json() == {"supported": True}
    assert api.get("/agents/pronunciation/support", params={"learning": "rus"}, headers=AUTH).json() == {"supported": False}
