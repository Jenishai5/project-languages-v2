import json

import httpx
import pytest
import respx

from langapp.integrations.supabase_storage import StorageError, SupabaseImageStore

URL = "https://proj.supabase.test"


def make_store() -> SupabaseImageStore:
    return SupabaseImageStore(URL, "service-key", "mnemonics")


@respx.mock
def test_save_uploads_bytes_with_upsert():
    route = respx.post(f"{URL}/storage/v1/object/mnemonics/user-1/7-eng-spa.png").mock(
        return_value=httpx.Response(200, json={"Key": "mnemonics/user-1/7-eng-spa.png"})
    )

    path = make_store().save("user-1/7-eng-spa.png", b"img", "image/png")

    assert path == "user-1/7-eng-spa.png"
    request = route.calls.last.request
    assert request.content == b"img"
    assert request.headers["x-upsert"] == "true"
    assert request.headers["Content-Type"] == "image/png"
    assert request.headers["apikey"] == "service-key"


@respx.mock
def test_signed_urls_are_made_absolute_and_errors_skipped():
    route = respx.post(f"{URL}/storage/v1/object/sign/mnemonics").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"path": "a.png", "signedURL": "/object/sign/mnemonics/a.png?token=t1", "error": None},
                {"path": "b.png", "signedURL": None, "error": "Either the object does not exist or you do not have access to it"},
            ],
        )
    )

    urls = make_store().signed_urls(["a.png", "b.png"], 3600)

    assert urls == {"a.png": f"{URL}/storage/v1/object/sign/mnemonics/a.png?token=t1"}
    assert json.loads(route.calls.last.request.content) == {"expiresIn": 3600, "paths": ["a.png", "b.png"]}


@respx.mock
def test_upload_failure_raises():
    missing_bucket = httpx.Response(400, json={"error": "Bucket not found"})
    respx.post(f"{URL}/storage/v1/object/mnemonics/x.png").mock(return_value=missing_bucket)

    with pytest.raises(StorageError):
        make_store().save("x.png", b"img", "image/png")


def test_no_paths_means_no_request():
    assert make_store().signed_urls([], 60) == {}
