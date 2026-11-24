import logging
import random
import time
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
MAX_PAGE_SIZE = 50


class TatoebaError(Exception):
    pass


@dataclass(frozen=True)
class Page:
    payload: dict
    next_url: str | None


class TatoebaClient:
    def __init__(
        self,
        base_url: str = "https://api.tatoeba.org",
        timeout_seconds: float = 10.0,
        max_retries: int = 4,
        min_interval_seconds: float = 1.0,
        user_agent: str = "project-languages-v2",
        backoff_base_seconds: float = 1.0,
        backoff_cap_seconds: float = 30.0,
        http: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._http = http or httpx.Client(
            base_url=base_url,
            timeout=timeout_seconds,
            headers={"User-Agent": user_agent, "Accept": "application/json"},
        )
        self._max_retries = max_retries
        self._min_interval = min_interval_seconds
        self._backoff_base = backoff_base_seconds
        self._backoff_cap = backoff_cap_seconds
        self._sleep = sleep
        self._clock = clock
        self._last_request_at: float | None = None

    def __enter__(self) -> "TatoebaClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def iter_sentence_pages(
        self,
        source_lang: str,
        target_langs: Sequence[str] = (),
        max_pages: int | None = None,
        page_size: int = MAX_PAGE_SIZE,
        max_words: int | None = None,
        with_audio: bool = False,
    ) -> Iterator[Page]:
        params: dict[str, str | int] | None = {
            "lang": source_lang,
            "sort": "created",
            "limit": min(page_size, MAX_PAGE_SIZE),
            "showtrans": "matching",
        }
        if target_langs:
            params["trans:lang"] = ",".join(target_langs)
        if max_words is not None:
            params["word_count"] = f"-{max_words}"
        if with_audio:
            params["has_audio"] = "yes"
            params["include"] = "audios"

        url: str | None = "/v1/sentences"
        pages = 0
        while url:
            payload = self._get_json(url, params)
            params = None
            paging = payload.get("paging") or {}
            next_url = paging.get("next") if paging.get("has_next") else None
            yield Page(payload=payload, next_url=next_url)

            pages += 1
            if max_pages is not None and pages >= max_pages:
                return
            url = next_url

    def search_sentences(
        self,
        lang: str,
        query: str,
        target_langs: Sequence[str],
        min_words: int = 3,
        max_words: int = 7,
        limit: int = 20,
    ) -> dict:
        params = {
            "lang": lang,
            "q": query,
            "sort": "words",
            "limit": min(limit, MAX_PAGE_SIZE),
            "showtrans": "matching",
            "trans:lang": ",".join(target_langs),
            "word_count": f"{min_words}-{max_words}",
            "include": "audios",
        }
        return self._get_json("/v1/sentences", params)

    def _get_json(self, url: str, params: dict | None) -> dict:
        for attempt in range(self._max_retries + 1):
            self._respect_rate_limit()
            try:
                response = self._http.get(url, params=params)
            except httpx.TransportError as exc:
                error = TatoebaError(f"network error: {exc.__class__.__name__}: {exc}")
                delay = self._backoff(attempt)
            else:
                if response.status_code == 200:
                    return self._decode(response)
                if response.status_code not in RETRYABLE_STATUS:
                    raise TatoebaError(f"HTTP {response.status_code}: {response.text[:200]}")
                error = TatoebaError(f"HTTP {response.status_code}")
                delay = self._retry_after(response)
                if delay is None:
                    delay = self._backoff(attempt)

            if attempt == self._max_retries:
                raise error
            logger.warning("%s, retry %d/%d in %.1fs", error, attempt + 1, self._max_retries, delay)
            self._sleep(delay)

        raise TatoebaError("unreachable")

    @staticmethod
    def _decode(response: httpx.Response) -> dict:
        try:
            payload = response.json()
        except ValueError as exc:
            raise TatoebaError("response is not valid JSON") from exc
        if not isinstance(payload, dict):
            raise TatoebaError("response JSON is not an object")
        return payload

    def _respect_rate_limit(self) -> None:
        if self._last_request_at is not None:
            elapsed = self._clock() - self._last_request_at
            if elapsed < self._min_interval:
                self._sleep(self._min_interval - elapsed)
        self._last_request_at = self._clock()

    def _backoff(self, attempt: int) -> float:
        delay = min(self._backoff_cap, self._backoff_base * 2**attempt)
        return delay + random.uniform(0, self._backoff_base)

    def _retry_after(self, response: httpx.Response) -> float | None:
        value = response.headers.get("Retry-After")
        if value is None:
            return None
        try:
            return min(float(value), 60.0)
        except ValueError:
            return None
