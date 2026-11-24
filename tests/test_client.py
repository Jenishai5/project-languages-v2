import httpx
import pytest
import respx

from langapp.ingestion.tatoeba_client import TatoebaClient, TatoebaError
from tests.conftest import load_fixture

BASE = "https://api.tatoeba.org"
NEXT = f"{BASE}/v1/sentences?after=abc"


class FakeTime:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def fake_time():
    return FakeTime()


@pytest.fixture
def client(fake_time):
    with TatoebaClient(
        base_url=BASE,
        max_retries=3,
        min_interval_seconds=1.0,
        backoff_base_seconds=0.0,
        sleep=fake_time.sleep,
        clock=fake_time.clock,
    ) as tatoeba:
        yield tatoeba


def page(next_url: str | None) -> dict:
    payload = load_fixture("tatoeba_page.json")
    payload["paging"] = {"total": 6, "has_next": next_url is not None, "next": next_url}
    return payload


@respx.mock
def test_sends_expected_query_parameters(client):
    route = respx.get(f"{BASE}/v1/sentences").mock(return_value=httpx.Response(200, json=page(None)))

    list(client.iter_sentence_pages("spa", ["eng", "rus"]))

    params = route.calls[0].request.url.params
    assert params["lang"] == "spa"
    assert params["trans:lang"] == "eng,rus"
    assert params["limit"] == "50"
    assert params["showtrans"] == "matching"


@respx.mock
def test_follows_next_url_until_last_page(client):
    respx.get(f"{BASE}/v1/sentences", params={"lang": "spa"}).mock(
        return_value=httpx.Response(200, json=page(NEXT))
    )
    respx.get(NEXT).mock(return_value=httpx.Response(200, json=page(None)))

    pages = list(client.iter_sentence_pages("spa"))

    assert len(pages) == 2
    assert pages[0].next_url == NEXT
    assert pages[1].next_url is None


@respx.mock
def test_stops_at_max_pages(client):
    respx.get(f"{BASE}/v1/sentences").mock(return_value=httpx.Response(200, json=page(NEXT)))

    pages = list(client.iter_sentence_pages("spa", max_pages=1))

    assert len(pages) == 1


@respx.mock
def test_retries_server_errors_then_succeeds(client):
    route = respx.get(f"{BASE}/v1/sentences").mock(
        side_effect=[httpx.Response(503), httpx.Response(502), httpx.Response(200, json=page(None))]
    )

    pages = list(client.iter_sentence_pages("spa"))

    assert route.call_count == 3
    assert len(pages) == 1


@respx.mock
def test_retries_timeouts_and_network_errors(client):
    route = respx.get(f"{BASE}/v1/sentences").mock(
        side_effect=[httpx.ReadTimeout("slow"), httpx.ConnectError("down"), httpx.Response(200, json=page(None))]
    )

    list(client.iter_sentence_pages("spa"))

    assert route.call_count == 3


@respx.mock
def test_honours_retry_after_on_429(client, fake_time):
    respx.get(f"{BASE}/v1/sentences").mock(
        side_effect=[httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200, json=page(None))]
    )

    list(client.iter_sentence_pages("spa"))

    assert 7.0 in fake_time.sleeps


@respx.mock
def test_does_not_retry_client_errors(client):
    route = respx.get(f"{BASE}/v1/sentences").mock(
        return_value=httpx.Response(400, json={"message": "Invalid language code"})
    )

    with pytest.raises(TatoebaError, match="HTTP 400"):
        list(client.iter_sentence_pages("zzz"))
    assert route.call_count == 1


@respx.mock
def test_gives_up_after_max_retries(client):
    route = respx.get(f"{BASE}/v1/sentences").mock(return_value=httpx.Response(500))

    with pytest.raises(TatoebaError, match="HTTP 500"):
        list(client.iter_sentence_pages("spa"))
    assert route.call_count == 4


@respx.mock
def test_rejects_invalid_json(client):
    respx.get(f"{BASE}/v1/sentences").mock(return_value=httpx.Response(200, text="<html>maintenance</html>"))

    with pytest.raises(TatoebaError, match="not valid JSON"):
        list(client.iter_sentence_pages("spa"))


@respx.mock
def test_waits_between_requests_to_respect_rate_limit(client, fake_time):
    respx.get(f"{BASE}/v1/sentences", params={"lang": "spa"}).mock(
        return_value=httpx.Response(200, json=page(NEXT))
    )
    respx.get(NEXT).mock(return_value=httpx.Response(200, json=page(None)))

    list(client.iter_sentence_pages("spa"))

    assert fake_time.sleeps == [1.0]


@respx.mock
def test_sends_word_count_and_audio_parameters(client):
    route = respx.get(f"{BASE}/v1/sentences").mock(return_value=httpx.Response(200, json=page(None)))

    list(client.iter_sentence_pages("eng", ["spa", "rus"], max_words=8, with_audio=True))

    params = route.calls[0].request.url.params
    assert params["word_count"] == "-8"
    assert params["has_audio"] == "yes"
    assert params["include"] == "audios"
