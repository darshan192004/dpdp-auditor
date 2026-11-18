"""Configuration from environment variables with validation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Final

from pydantic import SecretStr


@dataclass(frozen=True)
class Config:
    """Runtime configuration from environment."""

    scan_id: str
    orchestrator_url: str
    hmac_key: SecretStr
    internal_key: SecretStr
    org_id: str
    repo_url: str
    repo_ref: str
    workspace: str
    timeout_clone: int = 300
    timeout_semgrep: int = 180
    timeout_checkov: int = 120
    timeout_gitleaks: int = 60
    max_workspace_bytes: int = 6 * 1024**3  # 6 GiB
    callback_batch_size: int = 500
    callback_max_bytes: int = 1024 * 1024  # 1 MB
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> Config:
        """Load and validate configuration from environment variables."""
        scan_id = _require("SCAN_ID")
        orchestrator_url = _require("ORCHESTRATOR_URL")
        hmac_key = SecretStr(_require("CALLBACK_HMAC_KEY"))
        internal_key = SecretStr(_require("INTERNAL_KEY"))
        org_id = _require("ORG_ID")
        repo_url = _require("REPO_URL")
        repo_ref = _require("REPO_REF")
        workspace = _require("WORKSPACE")
        timeout_clone = _int_env("TIMEOUT_CLONE", 300)
        timeout_semgrep = _int_env("TIMEOUT_SEMGREP", 180)
        timeout_checkov = _int_env("TIMEOUT_CHECKOV", 120)
        timeout_gitleaks = _int_env("TIMEOUT_GITLEAKS", 60)
        max_workspace_bytes = _int_env("MAX_WORKSPACE_BYTES", 6 * 1024**3)
        callback_batch_size = _int_env("CALLBACK_BATCH_SIZE", 500)
        callback_max_bytes = _int_env("CALLBACK_MAX_BYTES", 1024 * 1024)
        log_level = os.getenv("LOG_LEVEL", "INFO").upper()

        return cls(
            scan_id=scan_id,
            orchestrator_url=orchestrator_url,
            hmac_key=hmac_key,
            internal_key=internal_key,
            org_id=org_id,
            repo_url=repo_url,
            repo_ref=repo_ref,
            workspace=workspace,
            timeout_clone=timeout_clone,
            timeout_semgrep=timeout_semgrep,
            timeout_checkov=timeout_checkov,
            timeout_gitleaks=timeout_gitleaks,
            max_workspace_bytes=max_workspace_bytes,
            callback_batch_size=callback_batch_size,
            callback_max_bytes=callback_max_bytes,
            log_level=log_level,
        )


def _require(name: str) -> str:
    """Require an environment variable to be present and non-empty."""
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Required environment variable {name} is not set")
    return value


def _int_env(name: str, default: int) -> int:
    """Parse an integer from environment, or return default."""
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer, got {value!r}") from exc


ALL_SCANNERS: Final[tuple[str, ...]] = ("semgrep", "checkov", "gitleaks")
SECRETS_ONLY_SCANNERS: Final[tuple[str, ...]] = ("gitleaks",)
