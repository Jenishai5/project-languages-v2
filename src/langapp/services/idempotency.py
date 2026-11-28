from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import TypeVar

from langapp.errors import Conflict
from langapp.repositories.idempotency import IdempotencyRepository

T = TypeVar("T")
KEY_LIFETIME = timedelta(hours=24)


def fingerprint(operation: str, payload: dict) -> str:
    text = json.dumps([operation, payload], sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class IdempotentRequests:
    def __init__(self, keys: IdempotencyRepository, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._keys = keys
        self._clock = clock

    def run(
        self,
        user_id: uuid.UUID,
        key: str | None,
        operation: str,
        payload: dict,
        perform: Callable[[], tuple[T, int]],
        replay: Callable[[int], T | None],
    ) -> tuple[T, bool]:
        if key is None:
            value, _ = perform()
            return value, False

        request = fingerprint(operation, payload)
        earlier = self._keys.claim(user_id, key, operation, request, self._clock() - KEY_LIFETIME)
        if earlier is None:
            value, result_id = perform()
            self._keys.finish(user_id, key, result_id)
            return value, False

        if earlier.operation != operation or earlier.fingerprint != request:
            raise Conflict("This Idempotency-Key was already used for a different request. Use a new key.")
        value = replay(earlier.result_id) if earlier.result_id is not None else None
        if value is None:
            raise Conflict("The result of this Idempotency-Key is no longer available. Use a new key.")
        return value, True
