import logging
from urllib.parse import quote

import httpx

from langapp.errors import ExternalSourceError

logger = logging.getLogger(__name__)


class StorageError(ExternalSourceError):
    pass


class SupabaseImageStore:
    def __init__(
        self,
        supabase_url: str,
        service_role_key: str,
        bucket: str,
        timeout_seconds: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._bucket = bucket
        self._storage_url = f"{supabase_url.rstrip('/')}/storage/v1"
        self._http = httpx.Client(
            base_url=self._storage_url,
            timeout=timeout_seconds,
            transport=transport,
            headers={"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"},
        )

    def close(self) -> None:
        self._http.close()

    def save(self, path: str, data: bytes, content_type: str) -> str:
        response = self._request(
            "POST",
            f"/object/{self._bucket}/{quote(path)}",
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "true", "Cache-Control": "max-age=31536000"},
        )
        if response.status_code not in (200, 201):
            logger.warning("Storage upload failed with %s: %s", response.status_code, response.text[:300])
            raise StorageError(f"Could not save the image ({response.status_code}).")
        return path

    def signed_urls(self, paths: list[str], expires_in: int) -> dict[str, str]:
        if not paths:
            return {}
        response = self._request("POST", f"/object/sign/{self._bucket}", json={"expiresIn": expires_in, "paths": paths})
        if response.status_code != 200:
            logger.warning("Storage signing failed with %s: %s", response.status_code, response.text[:300])
            raise StorageError(f"Could not open the saved images ({response.status_code}).")
        urls = {}
        for item in response.json():
            signed = item.get("signedURL")
            if signed and not item.get("error"):
                urls[item["path"]] = f"{self._storage_url}{signed}"
        return urls

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        try:
            return self._http.request(method, path, **kwargs)
        except httpx.TransportError as exc:
            raise StorageError("Could not reach Supabase Storage.") from exc
