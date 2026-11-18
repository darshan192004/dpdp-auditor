"""Authenticated HTTP callbacks from the scan runner to the orchestrator."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from typing import Any

import httpx

from scan_runner.config import Config

CALLBACK_TIMEOUT_SECONDS = 30.0


def compact_json(payload: dict[str, Any]) -> bytes:
    """Serialise a callback body exactly as it is sent on the wire."""
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def post_signed(
    config: Config,
    path: str,
    payload: dict[str, Any],
    *,
    client: httpx.Client | None = None,
) -> httpx.Response:
    """POST a JSON body with the internal HMAC envelope from docs/api.md §10.1."""
    body = compact_json(payload)
    timestamp = str(int(time.time()))
    secret = config.hmac_key.get_secret_value().encode("utf-8")
    signature = hmac.new(
        secret,
        f"{timestamp}.{body.decode()}".encode(),
        hashlib.sha256,
    ).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Key": config.internal_key.get_secret_value(),
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Signature": signature,
        "X-Org-Id": config.org_id,
        "X-Request-Id": f"req_{uuid.uuid4().hex}",
    }
    url = f"{config.orchestrator_url.rstrip('/')}{path}"

    if client is None:
        with httpx.Client(timeout=CALLBACK_TIMEOUT_SECONDS) as owned_client:
            response = owned_client.post(url, content=body, headers=headers)
    else:
        response = client.post(url, content=body, headers=headers)
    response.raise_for_status()
    return response
