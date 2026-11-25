import base64
import json

import httpx
import pytest
import respx

from langapp.errors import UpstreamRateLimited
from langapp.integrations.openrouter import OpenRouterClient, OpenRouterError

BASE = "https://openrouter.test/api/v1"
PNG = b"\x89PNG\r\n\x1a\nfake"


def make_client(**kwargs) -> OpenRouterClient:
    return OpenRouterClient(api_key="sk-test", base_url=BASE, sleep=lambda _: None, **kwargs)


@respx.mock
def test_chat_sends_model_messages_and_key():
    route = respx.post(f"{BASE}/chat/completions").mock(
        return_value=httpx.Response(200, json={"model": "nvidia/nemotron:free", "choices": [{"message": {"content": "hola"}}]})
    )

    reply = make_client().chat("openrouter/free", [{"role": "user", "content": "hi"}], user="u1")

    assert reply.text == "hola"
    assert reply.model == "nvidia/nemotron:free"
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer sk-test"
    body = json.loads(request.content)
    assert body == {"model": "openrouter/free", "messages": [{"role": "user", "content": "hi"}], "user": "u1"}


@respx.mock
def test_image_is_decoded_from_base64():
    route = respx.post(f"{BASE}/images").mock(
        return_value=httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG).decode(), "media_type": "image/png"}]})
    )

    image = make_client().generate_image("x-ai/grok-imagine-image-quality:free", "a duck")

    assert image.data == PNG
    assert image.media_type == "image/png"
    assert json.loads(route.calls.last.request.content)["aspect_ratio"] == "1:1"


@respx.mock
def test_rate_limit_is_not_retried():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=httpx.Response(429, json={"error": {"code": 429}}))

    with pytest.raises(UpstreamRateLimited):
        make_client().chat("openrouter/free", [])

    assert route.call_count == 1


@respx.mock
def test_server_error_is_retried_once_then_fails():
    route = respx.post(f"{BASE}/images").mock(return_value=httpx.Response(502, json={"error": {"code": 502}}))

    with pytest.raises(OpenRouterError):
        make_client().generate_image("m", "p")

    assert route.call_count == 2


@respx.mock
def test_empty_or_broken_answers_raise():
    blank = {"choices": [{"message": {"content": "  "}}]}
    respx.post(f"{BASE}/chat/completions").mock(return_value=httpx.Response(200, json=blank))
    respx.post(f"{BASE}/images").mock(return_value=httpx.Response(200, json={"data": []}))

    with pytest.raises(OpenRouterError, match="empty"):
        make_client().chat("m", [])
    with pytest.raises(OpenRouterError, match="no image"):
        make_client().generate_image("m", "p")


@respx.mock
def test_chat_json_sends_fallback_models_and_reads_usage():
    route = respx.post(f"{BASE}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={"model": "b:free", "choices": [{"message": {"content": "{}"}}], "usage": {"total_tokens": 77}},
        )
    )

    reply = make_client().chat_json(["a:free", "b:free"], [{"role": "user", "content": "hi"}], user="u1", max_tokens=300)

    body = json.loads(route.calls.last.request.content)
    assert body["model"] == "a:free" and body["models"] == ["a:free", "b:free"]
    assert body["max_tokens"] == 300 and body["user"] == "u1"
    assert (reply.model, reply.tokens) == ("b:free", 77)


def test_chat_json_needs_a_model():
    with pytest.raises(OpenRouterError):
        make_client().chat_json([], [{"role": "user", "content": "hi"}])
