"""Fixture-only canary containment for signed finding callbacks."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx
from pydantic import SecretStr

from scan_runner.batches import CALLBACK_FINDING_FIELDS, BatchClient
from scan_runner.config import Config

CANARY = "CANARY_PHASE_F_NEVER_EMIT"

CONFIG = Config(
    scan_id="scan-phase-f",
    orchestrator_url="http://orchestrator:3001",
    hmac_key=SecretStr("h" * 32),
    internal_key=SecretStr("i" * 32),
    org_id="org-1",
    repo_url="https://github.com/WebGoat/WebGoat.git",
    repo_ref="main",
    workspace="/workspace",
)


def test_callback_allowlist_never_carries_fixture_source_content() -> None:
    captured: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request.content)
        return httpx.Response(200, json={"data": {"accepted": 1, "duplicates": 0}})

    evidence = f'api_key = "{CANARY}"'
    finding: dict[str, Any] = {
        "scanner": "gitleaks",
        "rule_id": "generic-api-key",
        "severity": "high",
        "file": "src/fixture.py",
        "line": 3,
        "description": "Synthetic fixture finding.",
        "evidence": evidence,
        "fingerprint": "fpt_phase_f_canary",
        "snippet": CANARY,
        "value": CANARY,
        "content": CANARY,
        "raw": CANARY,
    }

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        batch = BatchClient(CONFIG, scanner="gitleaks", scanner_version="8.21.0", client=client)
        batch.add(finding)
        batch.finish()

    body = captured[0].decode("utf-8")
    payload = json.loads(body)
    assert CANARY not in body
    assert payload["findings"][0]["evidenceHash"] == "sha256:" + hashlib.sha256(
        evidence.encode()
    ).hexdigest()
    assert CALLBACK_FINDING_FIELDS == (
        "scannerRuleId",
        "scannerRuleVersion",
        "severity",
        "filePath",
        "lineStart",
        "lineEnd",
        "message",
        "evidenceHash",
        "fingerprint",
        "context",
    )
    assert set(payload["findings"][0]) == set(CALLBACK_FINDING_FIELDS)
