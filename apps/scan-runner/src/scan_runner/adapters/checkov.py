"""Adapter for Checkov scanner."""
import json
import subprocess
from pathlib import Path


class CheckovAdapter:
    """Adapter that runs Checkov on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "checkov"

    def run(self, repo_path: Path) -> list[dict]:
        """Execute Checkov on *repo_path* and return raw findings."""
        try:
            result = subprocess.run(
                [self.bin, "--output-format", "json", str(repo_path)],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Checkov execution timed out") from exc
        if result.returncode == 0 and result.stdout:
            data = json.loads(result.stdout)
            return data.get("results", [])
        return []

    def normalize(self, raw: list[dict]) -> list[dict]:
        """Convert Checkov raw output to internal finding format."""
        return raw
