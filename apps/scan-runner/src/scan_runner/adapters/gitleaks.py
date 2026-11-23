"""Adapter for Gitleaks scanner."""

import json
import subprocess
from pathlib import Path
from typing import Any


class GitleaksAdapter:
    """Adapter that runs Gitleaks on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "gitleaks"

    def run(self, repo_path: Path, timeout: int = 300) -> list[dict[str, Any]]:
        """Execute Gitleaks on *repo_path* and return raw findings."""
        try:
            result = subprocess.run(
                [
                    self.bin,
                    "detect",
                    "--source",
                    str(repo_path),
                    "--report-format",
                    "json",
                    "--report-path",
                    "-",
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Gitleaks execution timed out") from exc
        if result.returncode in (0, 1) and result.stdout:
            data: object = json.loads(result.stdout)
            if isinstance(data, list):
                return [item for item in data if isinstance(item, dict)]
            if isinstance(data, dict):
                findings = data.get("findings", [])
                if isinstance(findings, list):
                    return [item for item in findings if isinstance(item, dict)]
        return []

    def normalize(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Gitleaks raw output to internal finding format."""
        return raw
