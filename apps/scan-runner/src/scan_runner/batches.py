"""Batch callback client for sending findings to the orchestrator."""

from __future__ import annotations

import json
import uuid
from typing import Any

from scan_runner.config import Config


class BatchClient:
    """Sends findings to the orchestrator in batches.

    A batch is flushed when it reaches the configured *max count* or *max bytes*.
    Each batch carries an idempotent ``batchId`` so the orchestrator can safely
    replay.
    """

    def __init__(self, config: Config) -> None:
        self._config = config
        self._batch: list[dict[str, Any]] = []
        self._size_bytes: int = 0
        self._batch_id: str = str(uuid.uuid4())

    def add(self, finding: dict[str, Any]) -> None:
        """Add a finding; flush the batch if it is full."""
        item_bytes = len(json.dumps(finding, separators=(",", ":")).encode())
        if (len(self._batch) >= self._config.callback_batch_size
                or self._size_bytes + item_bytes >= self._config.callback_max_bytes):
            self._flush()
        self._batch.append(finding)
        self._size_bytes += item_bytes

    def finish(self) -> None:
        """Flush any remaining findings."""
        if self._batch:
            self._flush()

    def _flush(self) -> None:
        """POST the current batch to the orchestrator.

        This is a stub – real implementation signs the payload with HMAC and
        sends it to ``self._config.orchestrator_url``.
        """
        import logging
        log = logging.getLogger("scan_runner.batch")
        log.info(
            "Would POST batch %s (%d items, %d bytes) to %s",
            self._batch_id,
            len(self._batch),
            self._size_bytes,
            self._config.orchestrator_url,
        )
        # Reset for next batch
        self._batch.clear()
        self._size_bytes = 0
        self._batch_id = str(uuid.uuid4())
