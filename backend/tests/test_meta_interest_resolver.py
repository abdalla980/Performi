import httpx
import pytest

from app.services.meta_interest_resolver import resolve_interest, resolve_interests


class _FakeTransport(httpx.BaseTransport):
    def __init__(self, handler):
        self._handler = handler

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self._handler(request)


def test_resolve_interest_returns_top_match():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "adinterest" in str(request.url)
        assert "bakery" in str(request.url)
        return httpx.Response(200, json={"data": [{"id": "6003125908798", "name": "Bakeries"}]})

    client = httpx.Client(transport=_FakeTransport(handler))
    result = resolve_interest("bakery", access_token="tok", http_client=client)
    assert result == {"id": "6003125908798", "name": "Bakeries"}


def test_resolve_interest_returns_none_when_no_match():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": []})

    client = httpx.Client(transport=_FakeTransport(handler))
    assert resolve_interest("zzzz-unknown", access_token="tok", http_client=client) is None


def test_resolve_interests_collects_skipped():
    responses = iter(
        [
            httpx.Response(200, json={"data": [{"id": "1", "name": "Coffee"}]}),
            httpx.Response(200, json={"data": []}),
        ]
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return next(responses)

    client = httpx.Client(transport=_FakeTransport(handler))
    resolved, skipped = resolve_interests(["coffee", "nope"], access_token="tok", http_client=client)
    assert resolved == [{"id": "1", "name": "Coffee"}]
    assert skipped == ["nope"]
