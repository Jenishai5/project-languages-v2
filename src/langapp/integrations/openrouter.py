import base64
import logging
import time
from collections.abc import Callable, Sequence

import httpx

from langapp.domain import ChatReply, GeneratedImage
from langapp.errors import ExternalSourceError, UpstreamRateLimited

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {500, 502, 503, 524, 529}


class OpenRouterError(ExternalSourceError):
    pass


class OpenRouterClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://openrouter.ai/api/v1",
        timeout_seconds: float = 120.0,
        app_title: str = "TurtleTalk",
        max_retries: int = 1,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
            headers={
                "Authorization": f"Bearer {api_key}",
                "X-Title": app_title,
            },
        )
        self._max_retries = max_retries
        self._sleep = sleep

    def close(self) -> None:
        self._http.close()

    def chat(self, model: str, messages: list[dict], user: str | None = None) -> ChatReply:
        body: dict = {"model": model, "messages": messages}
        if user:
            body["user"] = user
        payload = self._post("/chat/completions", body)
        try:
            text = payload["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise OpenRouterError("The AI model sent an answer in an unexpected format.") from exc
        if not text.strip():
            raise OpenRouterError("The AI model sent an empty answer.")
        return ChatReply(text=text, model=payload.get("model", model))

    def chat_json(
        self, models: Sequence[str], messages: list[dict], user: str | None = None, max_tokens: int = 400
    ) -> ChatReply:
        names = [name for name in models if name]
        if not names:
            raise OpenRouterError("No AI model is configured.")
        body: dict = {"model": names[0], "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}
        if len(names) > 1:
            body["models"] = names
        if user:
            body["user"] = user
        payload = self._post("/chat/completions", body)
        try:
            text = payload["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise OpenRouterError("The AI model sent an answer in an unexpected format.") from exc
        if not text.strip():
            raise OpenRouterError("The AI model sent an empty answer.")
        usage = payload.get("usage") or {}
        tokens = usage.get("total_tokens") if isinstance(usage.get("total_tokens"), int) else None
        return ChatReply(text=text, model=payload.get("model", names[0]), tokens=tokens)

    def generate_image(self, model: str, prompt: str, user: str | None = None) -> GeneratedImage:
        body: dict = {"model": model, "prompt": prompt, "aspect_ratio": "1:1", "n": 1}
        if user:
            body["user"] = user
        payload = self._post("/images", body)
        try:
            first = payload["data"][0]
            data = base64.b64decode(first["b64_json"], validate=True)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise OpenRouterError("The image model sent no image.") from exc
        return GeneratedImage(data=data, media_type=first.get("media_type") or "image/png", model=model)

    def _post(self, path: str, body: dict) -> dict:
        attempt = 0
        while True:
            try:
                response = self._http.post(path, json=body)
            except httpx.TransportError as exc:
                if attempt < self._max_retries:
                    attempt += 1
                    self._sleep(2.0 * attempt)
                    continue
                raise OpenRouterError("Could not reach OpenRouter.") from exc

            if response.status_code == 200:
                try:
                    return response.json()
                except ValueError as exc:
                    raise OpenRouterError("OpenRouter sent a reply that is not JSON.") from exc
            if response.status_code == 429:
                raise UpstreamRateLimited("The free AI models are busy or today's free limit is used up. Try again later.")
            if response.status_code in RETRYABLE_STATUS and attempt < self._max_retries:
                attempt += 1
                self._sleep(2.0 * attempt)
                continue
            logger.warning("OpenRouter %s failed with %s: %s", path, response.status_code, response.text[:300])
            raise OpenRouterError(f"OpenRouter request failed ({response.status_code}).")
