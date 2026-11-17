"""Adapter for Gitleaks scanner."""
import json
import subprocess
from pathlib import Path


class GitleaksAdapter:
    """Adapter that runs Gitleaks on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "gitleaks"

    def run(self, repo_path: Path) -> list[dict]:
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
                timeout=300,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Gitleaks execution timed out") from exc
        if result.returncode in (0, 1) and result.stdout:
            data = json.loads(result.stdout)
            if isinstance(data, list):
                return data
            return data.get("findings", [])
        return []

    def normalize(self, raw: list[dict]) -> list[dict]:
        """Convert Gitleaks raw output to internal finding format."""
        return raw
