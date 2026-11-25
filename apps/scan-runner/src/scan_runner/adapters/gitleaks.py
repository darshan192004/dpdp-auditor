"""Adapter for Gitleaks scanner."""

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any


class GitleaksAdapter:
    """Adapter that runs Gitleaks on a repository and returns findings."""

    def __init__(self) -> None:
        self.bin: str = "gitleaks"

    def run(self, repo_path: Path, timeout: int = 300) -> list[dict[str, Any]]:
        """Execute Gitleaks on *repo_path* and return raw findings."""
        import os
        env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null"}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
            report_path = tmp.name
        try:
            result = subprocess.run(
                [
                    self.bin,
                    "dir",
                    str(repo_path),
                    "--report-format",
                    "json",
                    "--report-path",
                    report_path,
                    "--no-banner",
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
            )
            if result.returncode in (0, 1) and Path(report_path).exists():
                try:
                    data: object = json.loads(Path(report_path).read_text())
                    if isinstance(data, list):
                        return [item for item in data if isinstance(item, dict)]
                    if isinstance(data, dict):
                        findings = data.get("findings", [])
                        if isinstance(findings, list):
                            return [item for item in findings if isinstance(item, dict)]
                except (json.JSONDecodeError, OSError):
                    pass
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError("Gitleaks execution timed out") from exc
        finally:
            try:
                Path(report_path).unlink(missing_ok=True)
            except OSError:
                pass
        return []

    def normalize(self, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert Gitleaks raw output to internal finding format."""
        return raw
