"""Adapter for Semgrep scanner."""

import json
import subprocess
from pathlib import Path
from typing import Any


class SemgrepAdapter:
    """Adapter that runs Semgrep on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "semgrep"

    def run(self, repo_path: Path, timeout: int = 300) -> list[dict[str, Any]]:
        """Execute Semgrep on *repo_path* and return raw findings."""
        try:
            result = subprocess.run(
                [self.bin, "--json", str(repo_path)],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Semgrep execution timed out") from exc
        if result.returncode == 0 and result.stdout:
            data: dict[str, Any] = json.loads(result.stdout)
            results = data.get("results", [])
            if isinstance(results, list):
                return [item for item in results if isinstance(item, dict)]
        return []

    def normalize(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Semgrep raw output to internal finding format."""
        return raw
