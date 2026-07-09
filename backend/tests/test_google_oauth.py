import httpx

from app.services.google_oauth import build_authorize_url, exchange_code_for_tokens


def test_build_authorize_url_includes_scope_and_state():
    url = build_authorize_url(state="abc123")
    assert "state=abc123" in url
    assert "adwords" in url


def test_exchange_code_for_tokens_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/token"
        return httpx.Response(200, json={"refresh_token": "rt-1", "access_token": "at-1"})

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    result = exchange_code_for_tokens("auth-code", http_client=http_client)

    assert result.refresh_token == "rt-1"
