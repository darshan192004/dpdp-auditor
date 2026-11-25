"""Adapter for Checkov scanner."""

import json
import subprocess
from pathlib import Path
from typing import Any


class CheckovAdapter:
    """Adapter that runs Checkov on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "checkov"

    def run(self, repo_path: Path, timeout: int = 300) -> list[dict[str, Any]]:
        """Execute Checkov on *repo_path* and return raw findings."""
        try:
            result = subprocess.run(
                [self.bin, "--output", "json", "-d", str(repo_path), "--quiet", "--include-all-checkov-policies"],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Checkov execution timed out") from exc
        # Checkov returns 1 when findings exist, 0 when clean - both are success
        # Output goes to stdout, not file. Format is a list of check types, each with "results" containing "failed_checks"
        if result.returncode in (0, 1) and result.stdout:
            try:
                data: object = json.loads(result.stdout)
                if isinstance(data, list):
                    # Checkov JSON output format: [{"results": {"failed_checks": [...]}, "summary": {...}}, ...]
                    all_results = []
                    for item in data:
                        if isinstance(item, dict) and "results" in item:
                            results = item.get("results", {})
                            if isinstance(results, dict):
                                failed_checks = results.get("failed_checks", [])
                                if isinstance(failed_checks, list):
                                    all_results.extend([r for r in failed_checks if isinstance(r, dict)])
                    return all_results
            except (json.JSONDecodeError, OSError):
                pass
        return []

    def normalize(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Checkov raw output to internal finding format."""
        return raw
