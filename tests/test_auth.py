import uuid

import httpx
import pytest
import respx

from langapp.auth import AuthError, SupabaseTokenVerifier

URL = "https://demo.supabase.co"
USER_ID = "8c5b4a3e-2f1d-4c6b-9a8e-7d6c5b4a3e2f"


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def verifier(clock):
    return SupabaseTokenVerifier(URL, "anon-key", http=httpx.Client(), cache_seconds=60, clock=clock)


@respx.mock
def test_valid_token_returns_user_and_sends_keys(verifier):
    route = respx.get(f"{URL}/auth/v1/user").mock(
        return_value=httpx.Response(200, json={"id": USER_ID, "email": "jeni@example.com"})
    )

    user = verifier.verify("good-token")

    assert user.id == uuid.UUID(USER_ID)
    assert route.calls[0].request.headers["apikey"] == "anon-key"
    assert route.calls[0].request.headers["authorization"] == "Bearer good-token"


@respx.mock
def test_invalid_token_raises(verifier):
    respx.get(f"{URL}/auth/v1/user").mock(return_value=httpx.Response(401, json={"msg": "bad jwt"}))

    with pytest.raises(AuthError, match="invalid or expired"):
        verifier.verify("bad-token")


@respx.mock
def test_answer_is_cached_until_it_expires(verifier, clock):
    route = respx.get(f"{URL}/auth/v1/user").mock(
        return_value=httpx.Response(200, json={"id": USER_ID})
    )

    verifier.verify("token")
    verifier.verify("token")
    clock.now = 61
    verifier.verify("token")

    assert route.call_count == 2


@respx.mock
def test_supabase_down_is_an_auth_error(verifier):
    respx.get(f"{URL}/auth/v1/user").mock(side_effect=httpx.ConnectError("down"))

    with pytest.raises(AuthError, match="cannot reach Supabase"):
        verifier.verify("token")
