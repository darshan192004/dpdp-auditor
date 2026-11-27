"""Bounded value shapes shared by DPDP inventory detectors."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Final

MODULE_KEYS: Final[tuple[str, ...]] = (
    "schema_scan",
    "form_scan",
    "mechanism_scan",
    "artefact_scan",
)
DETECTOR_STATUSES: Final[frozenset[str]] = frozenset(
    {"completed", "failed", "timed_out", "skipped"}
)
MAX_SIGNALS_PER_MODULE: Final = 500


@dataclass(frozen=True)
class ModuleResult:
    """One detector's bounded output and terminal status."""

    key: str
    signals: list[dict[str, Any]]
    status: str


def utc_now() -> str:
    """Return a compact UTC timestamp for inventory facts."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def make_signal(
    detector: str,
    kind: str,
    path: str,
    line: int | None,
    token: str,
    count: int | None = None,
) -> dict[str, Any]:
    """Build only contract-allowed fields; callers never pass source text."""
    signal: dict[str, Any] = {
        "detector": detector,
        "kind": kind,
        "path": path,
        "line": line,
        "token": token,
    }
    if count is not None:
        signal["count"] = count
    return signal
