import httpx

from app.services.meta_oauth import build_authorize_url, exchange_code_for_tokens


def test_build_authorize_url_includes_scope_and_state():
    url = build_authorize_url(state="xyz789")
    assert "state=xyz789" in url
    assert "ads_management" in url


def test_exchange_code_for_tokens_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/oauth/access_token")
        return httpx.Response(200, json={"access_token": "meta-at-1", "token_type": "bearer"})

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    result = exchange_code_for_tokens("auth-code", http_client=http_client)

    assert result.access_token == "meta-at-1"
