"""Batch callback client for sending findings to the orchestrator."""

from __future__ import annotations

import hashlib
import uuid
from typing import Any, Final

import httpx

from scan_runner.callbacks import post_signed
from scan_runner.config import Config
from scan_runner.versions import pinned_version

CALLBACK_FINDING_FIELDS: Final[tuple[str, ...]] = (
    "scannerRuleId",
    "scannerRuleVersion",
    "severity",
    "filePath",
    "lineStart",
    "lineEnd",
    "message",
    "evidenceHash",
    "fingerprint",
    "context",
)


class BatchClient:
    """Sends findings to the orchestrator in signed, idempotent batches.

    A batch is flushed when it reaches the configured *max count* or *max bytes*.
    Each batch carries a stable ``batchId`` so a failed POST can be retried
    without duplicating findings in the orchestrator.
    """

    def __init__(
        self,
        config: Config,
        scanner: str,
        scanner_version: str | None = None,
        *,
        client: httpx.Client | None = None,
    ) -> None:
        self._config = config
        self._scanner = scanner
        self._scanner_version = scanner_version or pinned_version(scanner)
        self._client = client
        self._batch: list[dict[str, Any]] = []
        self._size_bytes: int = 0
        self._batch_id: str = f"bat_{uuid.uuid4().hex}"

    def add(self, finding: dict[str, Any]) -> None:
        """Add a finding; flush the batch if it is full."""
        item_bytes = len(str(finding).encode())
        if (
            len(self._batch) >= self._config.callback_batch_size
            or self._size_bytes + item_bytes >= self._config.callback_max_bytes
        ):
            self._flush()
        self._batch.append(finding)
        self._size_bytes += item_bytes

    def finish(self) -> None:
        """Flush any remaining findings."""
        if self._batch:
            self._flush()

    def _flush(self) -> None:
        """POST the current batch; clear it only after the orchestrator accepts it."""
        payload = {
            "batchId": self._batch_id,
            "scanner": self._scanner,
            "scannerVersion": self._scanner_version,
            "findings": [to_api_finding(item, self._scanner_version) for item in self._batch],
        }
        post_signed(
            self._config,
            f"/internal/v1/scans/{self._config.scan_id}/findings",
            payload,
            client=self._client,
        )
        self._batch.clear()
        self._size_bytes = 0
        self._batch_id = f"bat_{uuid.uuid4().hex}"


def to_api_finding(finding: dict[str, Any], scanner_version: str) -> dict[str, Any]:
    """Map the runner's snake_case shape to docs/api.md §10.4.

    Raw evidence is never sent: it can contain secrets. Only a hash is included.
    Scanner-specific metadata is also omitted because it is unbounded and may
    contain source snippets.
    """
    line = _non_negative_int(finding.get("line", 0))
    evidence = str(finding.get("evidence") or "")
    payload: dict[str, Any] = {
        "scannerRuleId": str(finding.get("rule_id") or "unknown"),
        "scannerRuleVersion": scanner_version,
        "severity": str(finding.get("severity") or "medium").lower(),
        "filePath": str(finding.get("file") or ""),
        "lineStart": line,
        "lineEnd": line,
        "message": str(finding.get("description") or ""),
        "evidenceHash": "sha256:" + hashlib.sha256(evidence.encode()).hexdigest(),
        "fingerprint": str(finding.get("fingerprint") or ""),
        "context": {},
    }
    return {key: payload[key] for key in CALLBACK_FINDING_FIELDS}


def _non_negative_int(value: object) -> int:
    if isinstance(value, (int, float, str)):
        try:
            return max(0, int(value))
        except ValueError:
            return 0
    return 0
