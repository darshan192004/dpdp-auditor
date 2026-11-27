"""The bundled DPDPA rule pack must be passed to Semgrep explicitly.

Without ``--config`` Semgrep falls back to its registry "auto" rules, which only
flag CI/Docker files and never map to a DPDPA control (the PDF coverage bug).
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from scan_runner.adapters.semgrep import SemgrepAdapter

WORKSPACE = Path("/repo")
REPO_ROOT = Path(__file__).resolve().parents[3]


def _command(monkeypatch: pytest.MonkeyPatch, rules: str | None) -> list[str]:
    if rules is None:
        monkeypatch.delenv("SEMGREP_RULES", raising=False)
    else:
        monkeypatch.setenv("SEMGREP_RULES", rules)
    completed = subprocess.CompletedProcess([], 0, stdout='{"results": []}', stderr="")
    with patch.object(subprocess, "run", return_value=completed) as run:
        SemgrepAdapter().run(WORKSPACE, 10)
    return list(run.call_args.args[0])


def test_passes_configured_rule_pack(monkeypatch: pytest.MonkeyPatch) -> None:
    command = _command(monkeypatch, "/dpdpa.yaml")

    assert command == ["semgrep", "--json", "--config", "/dpdpa.yaml", str(WORKSPACE)]


def test_omits_config_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    command = _command(monkeypatch, None)

    assert command == ["semgrep", "--json", str(WORKSPACE)]


def test_image_replaces_the_default_semgrepignore() -> None:
    """The stock template drops `tests/`; the image must override it."""
    dockerfile = (REPO_ROOT / "docker" / "scan-runner.Dockerfile").read_text()
    assert "COPY docker/dpdpa.semgrepignore /dpdpa.semgrepignore" in dockerfile
    assert "SEMGREP_R2C_INTERNAL_EXPLICIT_SEMGREPIGNORE=/dpdpa.semgrepignore" in dockerfile

    patterns = [
        line.strip()
        for line in (REPO_ROOT / "docker" / "dpdpa.semgrepignore").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert "tests/" not in patterns
    assert "test/" not in patterns
