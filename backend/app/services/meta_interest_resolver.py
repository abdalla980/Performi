"""Resolve free-text Meta interest keywords to Graph API interest IDs.

Free-text names cannot be passed directly into Meta's targeting.flexible_spec —
they must be resolved via Targeting Search first. Unmatched keywords are skipped
(soft-fail) so a single unknown interest doesn't block the whole push.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_GRAPH_VERSION = "v21.0"


def resolve_interest(
    keyword: str,
    access_token: str,
    http_client: httpx.Client | None = None,
) -> dict | None:
    """Return {"id": ..., "name": ...} for the top Targeting Search match, or None."""
    owns_client = http_client is None
    client = http_client or httpx.Client(timeout=15.0)
    try:
        response = client.get(
            f"https://graph.facebook.com/{_GRAPH_VERSION}/search",
            params={
                "type": "adinterest",
                "q": keyword,
                "limit": 1,
                "access_token": access_token,
            },
        )
        response.raise_for_status()
        data = response.json().get("data") or []
        if not data:
            logger.info("Meta interest %r did not resolve — skipping", keyword)
            return None
        top = data[0]
        interest_id = top.get("id")
        name = top.get("name")
        if not interest_id:
            return None
        return {"id": str(interest_id), "name": name or keyword}
    except Exception:
        logger.exception("Meta interest resolution failed for %r — skipping", keyword)
        return None
    finally:
        if owns_client:
            client.close()


def resolve_interests(
    keywords: list[str],
    access_token: str,
    http_client: httpx.Client | None = None,
) -> tuple[list[dict], list[str]]:
    """Resolve many interests. Returns (resolved, skipped_keywords)."""
    resolved: list[dict] = []
    skipped: list[str] = []
    for keyword in keywords:
        match = resolve_interest(keyword, access_token, http_client=http_client)
        if match is None:
            skipped.append(keyword)
        else:
            resolved.append(match)
    return resolved, skipped
