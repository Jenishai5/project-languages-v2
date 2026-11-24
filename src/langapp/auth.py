import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass

import httpx


class AuthError(Exception):
    pass


class AuthNotConfigured(Exception):
    pass


@dataclass(frozen=True)
class AuthUser:
    id: uuid.UUID
    email: str | None


class SupabaseTokenVerifier:
    def __init__(
        self,
        supabase_url: str,
        anon_key: str,
        http: httpx.Client | None = None,
        cache_seconds: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._url = supabase_url.rstrip("/") + "/auth/v1/user"
        self._anon_key = anon_key
        self._http = http or httpx.Client(timeout=5.0)
        self._cache_seconds = cache_seconds
        self._clock = clock
        self._cache: dict[str, tuple[AuthUser, float]] = {}

    def verify(self, token: str) -> AuthUser:
        cached = self._cache.get(token)
        if cached and cached[1] > self._clock():
            return cached[0]

        try:
            response = self._http.get(
                self._url, headers={"apikey": self._anon_key, "Authorization": f"Bearer {token}"}
            )
        except httpx.TransportError as exc:
            raise AuthError(f"cannot reach Supabase: {exc.__class__.__name__}") from exc

        if response.status_code != 200:
            self._cache.pop(token, None)
            raise AuthError("invalid or expired token")
        try:
            body = response.json()
            user = AuthUser(id=uuid.UUID(body["id"]), email=body.get("email"))
        except (ValueError, KeyError, TypeError) as exc:
            raise AuthError("unexpected answer from Supabase") from exc

        self._cache[token] = (user, self._clock() + self._cache_seconds)
        return user
