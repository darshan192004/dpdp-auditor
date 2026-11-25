"""Adapter for Semgrep scanner."""

import json
import os
import subprocess
from pathlib import Path
from typing import Any


class SemgrepAdapter:
    """Adapter that runs Semgrep on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "semgrep"

    def run(self, repo_path: Path, timeout: int = 300) -> list[dict[str, Any]]:
        """Execute Semgrep on *repo_path* and return raw findings."""
        command = [self.bin, "--json"]
        # The runner image bundles the signed DPDPA rule pack. Without an
        # explicit --config Semgrep falls back to its registry "auto" rules,
        # which mainly flag CI/Docker files and never map to a DPDPA control.
        rules = os.getenv("SEMGREP_RULES")
        if rules:
            command += ["--config", rules]
        command.append(str(repo_path))
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Semgrep execution timed out") from exc
        if result.returncode != 0:
            # `semgrep --json` exits 0 even when findings exist (no --error),
            # so any nonzero exit means the scan itself failed.
            detail = result.stderr.strip() or result.stdout.strip()
            message = f"Semgrep execution failed (exit code {result.returncode}): {detail}"
            raise RuntimeError(message)
        if result.returncode == 0 and result.stdout:
            data: dict[str, Any] = json.loads(result.stdout)
            results = data.get("results", [])
            if isinstance(results, list):
                return [item for item in results if isinstance(item, dict)]
        return []

    def normalize(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Semgrep raw output to internal finding format."""
        return raw
