"""Regression tests: real scanner JSON must normalise into API-valid findings."""

from __future__ import annotations

from pathlib import Path

from scan_runner.normalise import normalize_findings

SEMGREP_RAW = [
    {
        "check_id": "python.lang.security.audit.logging-sensitive-data",
        "path": "services/payments/api/views.py",
        "start": {"line": 142, "col": 5},
        "end": {"line": 142, "col": 60},
        "extra": {
            "message": "Personal data is written to application logs.",
            "severity": "ERROR",
            "lines": 'logger.info("card=4111111111111111")',
        },
    }
]

CHECKOV_RAW = [
    {
        "check_id": "CKV_AWS_20",
        "check_result": {"result": "FAIL"},
        "file_path": "/repo/infra/main.tf",
        "repo_path": "infra/main.tf",
        "file_line_range": [12, 18],
        "resource": "aws_s3_bucket.public",
    }
]

GITLEAKS_RAW = [
    {
        "Description": "Generic API Key",
        "RuleID": "generic-api-key",
        "Severity": "high",
        "File": "config/settings.py",
        "StartLine": 27,
        "Match": "api_key = '***'",
    }
]


def test_semgrep_raw_shape_produces_api_valid_finding() -> None:
    [finding] = normalize_findings("semgrep", SEMGREP_RAW, Path("/repo"), salt="scan_1")

    assert finding["rule_id"] == "python.lang.security.audit.logging-sensitive-data"
    assert finding["file"] == "services/payments/api/views.py"
    assert finding["line"] == 142
    assert finding["description"] == "Personal data is written to application logs."
    assert finding["severity"] == "high"


def test_checkov_raw_shape_produces_api_valid_finding() -> None:
    [finding] = normalize_findings("checkov", CHECKOV_RAW, Path("/repo"), salt="scan_1")

    assert finding["rule_id"] == "CKV_AWS_20"
    assert finding["file"] == "infra/main.tf"
    assert finding["line"] == 12
    assert finding["description"]


def test_gitleaks_raw_shape_produces_api_valid_finding() -> None:
    [finding] = normalize_findings("gitleaks", GITLEAKS_RAW, Path("/repo"), salt="scan_1")

    assert finding["rule_id"] == "generic-api-key"
    assert finding["file"] == "config/settings.py"
    assert finding["line"] == 27
    assert finding["description"] == "Generic API Key"
    assert finding["severity"] == "high"


def test_unknown_shape_never_emits_an_empty_message() -> None:
    [finding] = normalize_findings("semgrep", [{}], Path("/repo"), salt="scan_1")

    assert finding["description"]
    assert finding["rule_id"] == "unknown"
