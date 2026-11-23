"""The configured per-scanner timeouts must reach the subprocess deadline."""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scan_runner.adapters.checkov import CheckovAdapter
from scan_runner.adapters.gitleaks import GitleaksAdapter
from scan_runner.adapters.semgrep import SemgrepAdapter
from scan_runner.cli import run_scanner

WORKSPACE = Path("/repo")


@pytest.mark.parametrize("adapter", [SemgrepAdapter(), CheckovAdapter(), GitleaksAdapter()])
def test_adapter_passes_configured_timeout_to_subprocess(adapter: object) -> None:
    completed = subprocess.CompletedProcess([], 0, stdout="{}", stderr="")
    with patch.object(subprocess, "run", return_value=completed) as run:
        adapter.run(WORKSPACE, 42)  # type: ignore[attr-defined]

    assert run.call_args.kwargs["timeout"] == 42


def test_run_scanner_forwards_timeout_to_adapter() -> None:
    adapter = MagicMock()
    adapter.run.return_value = []
    adapter.normalize.return_value = []

    findings, status, _duration = run_scanner("semgrep", adapter, WORKSPACE, 77)

    adapter.run.assert_called_once_with(WORKSPACE, 77)
    assert findings == []
    assert status == "completed"
