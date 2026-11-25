"""Regression tests for scanner adapter output and exit handling."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from scan_runner.adapters.checkov import CheckovAdapter
from scan_runner.adapters.semgrep import SemgrepAdapter

WORKSPACE = Path("/repo")


def completed(returncode: int, stdout: str, stderr: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], returncode, stdout=stdout, stderr=stderr)


def test_checkov_accepts_single_object_output() -> None:
    finding = {"check_id": "CKV_AWS_20", "resource": "aws_s3_bucket.logs"}
    output = json.dumps({"results": {"failed_checks": [finding]}, "summary": {"failed": 1}})

    with patch.object(subprocess, "run", return_value=completed(1, output)):
        result = CheckovAdapter().run(WORKSPACE)

    assert result == [finding]


def test_checkov_still_accepts_array_output() -> None:
    first = {"check_id": "CKV_AWS_20"}
    second = {"check_id": "CKV_AWS_1"}
    output = json.dumps(
        [
            {"results": {"failed_checks": [first]}},
            {"results": {"failed_checks": [second]}},
        ]
    )

    with patch.object(subprocess, "run", return_value=completed(1, output)):
        result = CheckovAdapter().run(WORKSPACE)

    assert result == [first, second]


@pytest.mark.parametrize("returncode", [1, 2])
def test_semgrep_raises_on_failed_exit(returncode: int) -> None:
    failed = completed(returncode, "", "invalid configuration: SEMGREP_RULES is missing")

    with (
        patch.object(subprocess, "run", return_value=failed),
        pytest.raises(RuntimeError, match=f"exit code {returncode}"),
    ):
        SemgrepAdapter().run(WORKSPACE)


def test_semgrep_accepts_successful_empty_scan() -> None:
    with patch.object(subprocess, "run", return_value=completed(0, '{"results": []}')):
        result = SemgrepAdapter().run(WORKSPACE)

    assert result == []
