"""Contract tests for the runner's internal callbacks."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from scan_runner.callbacks import post_signed
from scan_runner.cli import send_completion, send_progress
from scan_runner.config import Config
from scan_runner.versions import SCANNER_VERSIONS

CONFIG = Config(
    scan_id="scan-1",
    orchestrator_url="http://orchestrator:3001",
    hmac_key=SecretStr("h" * 32),
    internal_key=SecretStr("i" * 32),
    org_id="org-1",
    repo_url="https://github.com/acme/payments-service.git",
    repo_ref="main",
    workspace="/workspace",
)


def expected_signature(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(
        secret.encode(),
        f"{timestamp}.{body.decode()}".encode(),
        hashlib.sha256,
    ).hexdigest()


def test_post_signed_signs_the_exact_request_body() -> None:
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"accepted": 1}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        response = post_signed(
            CONFIG,
            "/internal/v1/scans/scan-1/findings",
            {"hello": "world"},
            client=client,
        )

    assert response.status_code == 200
    request = captured["request"]
    assert request.url.path == "/internal/v1/scans/scan-1/findings"
    assert request.content == b'{"hello":"world"}'
    assert request.headers["content-type"] == "application/json"
    assert request.headers["x-internal-key"] == "i" * 32
    assert request.headers["x-org-id"] == "org-1"
    request_id = request.headers["x-request-id"]
    assert request_id.startswith("req_")
    assert 8 <= len(request_id) <= 64

    timestamp = request.headers["x-internal-timestamp"]
    assert timestamp.isdigit()
    assert abs(int(time.time()) - int(timestamp)) <= 5
    assert request.headers["x-internal-signature"] == expected_signature(
        "h" * 32, timestamp, request.content
    )


def test_batch_client_maps_normalised_findings_to_the_api_contract() -> None:
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"accepted": 1, "duplicates": 0}})

    evidence = 'logger.info("card=4111111111111111")'
    finding = {
        "scanner": "semgrep",
        "rule_id": "python.lang.security.audit.logging-sensitive-data",
        "severity": "critical",
        "file": "services/payments/api/views.py",
        "line": 142,
        "description": "Personal data is written to application logs.",
        "evidence": evidence,
        "fingerprint": "fpt_123",
        "metadata": {"secret": "must-not-be-sent"},
    }

    from scan_runner.batches import BatchClient

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        batch = BatchClient(CONFIG, scanner="semgrep", scanner_version="1.95.0", client=client)
        batch.add(finding)
        batch.finish()

    payload = json.loads(captured["request"].content)
    assert payload["batchId"].startswith("bat_")
    assert payload["scanner"] == "semgrep"
    assert payload["scannerVersion"] == "1.95.0"
    assert payload["findings"] == [
        {
            "scannerRuleId": "python.lang.security.audit.logging-sensitive-data",
            "scannerRuleVersion": "1.95.0",
            "severity": "critical",
            "filePath": "services/payments/api/views.py",
            "lineStart": 142,
            "lineEnd": 142,
            "message": "Personal data is written to application logs.",
            "evidenceHash": "sha256:" + hashlib.sha256(evidence.encode()).hexdigest(),
            "fingerprint": "fpt_123",
            "context": {},
        }
    ]
    assert "secret" not in request_text(captured["request"])


def test_failed_flush_keeps_the_batch_id_for_a_retry() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        status = 500 if len(requests) == 1 else 200
        return httpx.Response(status, json={"error": {"code": "INTERNAL"}})

    from scan_runner.batches import BatchClient

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        batch = BatchClient(CONFIG, scanner="checkov", scanner_version="3.2.0", client=client)
        batch.add(minimal_finding())
        with pytest.raises(httpx.HTTPStatusError):
            batch.finish()
        batch.finish()

    first = json.loads(requests[0].content)
    second = json.loads(requests[1].content)
    assert first["batchId"] == second["batchId"]
    assert len(requests) == 2


def test_send_progress_posts_scanning_status() -> None:
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"status": "scanning", "updated": True}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        send_progress(CONFIG, client=client)

    assert captured["request"].url.path == "/internal/v1/scans/scan-1/progress"
    assert captured["request"].content == b'{"status":"scanning"}'
    assert captured["request"].headers["x-internal-key"] == "i" * 32
    assert captured["request"].headers["x-org-id"] == "org-1"


def test_send_completion_posts_all_scanner_reports() -> None:
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"status": "completed"}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        send_completion(
            CONFIG,
            {"semgrep": "completed", "checkov": "completed", "gitleaks": "timed_out"},
            {"semgrep": 2, "checkov": 1, "gitleaks": 0},
            durations={"semgrep": 1234, "checkov": 567, "gitleaks": 60000},
            commit_sha="a" * 40,
            workspace_bytes=42,
            client=client,
        )

    payload = json.loads(captured["request"].content)
    assert captured["request"].url.path == "/internal/v1/scans/scan-1/complete"
    assert payload["scanners"] == [
        {
            "name": "semgrep",
            "status": "completed",
            "version": SCANNER_VERSIONS["semgrep"],
            "durationMs": 1234,
            "findings": 2,
        },
        {
            "name": "checkov",
            "status": "completed",
            "version": SCANNER_VERSIONS["checkov"],
            "durationMs": 567,
            "findings": 1,
        },
        {
            "name": "gitleaks",
            "status": "timed_out",
            "version": SCANNER_VERSIONS["gitleaks"],
            "durationMs": 60000,
            "findings": 0,
        },
    ]
    assert payload["commitSha"] == "a" * 40
    assert payload["workspaceBytes"] == 42
    assert payload["facts"] == {"languages": [], "frameworks": [], "resourceTypes": []}


def test_send_completion_forwards_collected_repo_facts() -> None:
    """Facts drive applicability (rules.md §13); an empty payload would drop
    every conditional control from the assessment, so they must be forwarded
    exactly as collected."""
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"status": "completed"}})

    facts = {
        "languages": ["javascript", "typescript"],
        "frameworks": ["vue"],
        "resourceTypes": ["aws_s3_bucket"],
    }

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        send_completion(
            CONFIG,
            {"semgrep": "completed", "checkov": "completed", "gitleaks": "completed"},
            {"semgrep": 1, "checkov": 0, "gitleaks": 0},
            facts=facts,
            client=client,
        )

    payload = json.loads(captured["request"].content)
    assert payload["facts"] == facts


def test_send_completion_emits_every_resource_type_without_a_cap() -> None:
    """The producer must not truncate collected facts before signing them."""
    captured: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"data": {"status": "completed"}})

    resource_types = [f"aws_resource_{index:04d}" for index in range(600)]

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        send_completion(
            CONFIG,
            {"semgrep": "completed", "checkov": "completed", "gitleaks": "completed"},
            {"semgrep": 0, "checkov": 0, "gitleaks": 0},
            facts={"languages": [], "frameworks": [], "resourceTypes": resource_types},
            client=client,
        )

    payload = json.loads(captured["request"].content)
    assert payload["facts"]["resourceTypes"] == resource_types


def test_config_loads_callback_identity_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    values: dict[str, str] = {
        "SCAN_ID": "scan-env",
        "ORCHESTRATOR_URL": "http://localhost:3001",
        "CALLBACK_HMAC_KEY": "h" * 32,
        "INTERNAL_KEY": "i" * 32,
        "ORG_ID": "org-env",
        "REPO_URL": "https://github.com/acme/payments-service.git",
        "REPO_REF": "main",
        "WORKSPACE": "/workspace",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)

    config = Config.from_env()

    assert config.scan_id == "scan-env"
    assert config.org_id == "org-env"
    assert config.internal_key.get_secret_value() == "i" * 32
    assert config.orchestrator_url == "http://localhost:3001"


def minimal_finding() -> dict[str, Any]:
    return {
        "scanner": "checkov",
        "rule_id": "CKV_AWS_20",
        "severity": "high",
        "file": "infra/main.tf",
        "line": 10,
        "description": "S3 bucket allows public read access.",
        "evidence": "",
        "fingerprint": "fpt_456",
        "metadata": {},
    }


def request_text(request: httpx.Request) -> str:
    return request.content.decode("utf-8")
