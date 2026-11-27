"""Deadline-aware orchestration for the four bounded inventory detectors."""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .artefact_scan import scan_artefacts
from .form_scan import scan_form
from .mechanism_scan import scan_mechanisms
from .schema_scan import scan_schema
from .types import DETECTOR_STATUSES, MODULE_KEYS, ModuleResult, utc_now

INVENTORY_VERSION = "inventory-1.0.0"
_DETECTORS: tuple[tuple[str, Callable[[Path, float], ModuleResult]], ...] = (
    ("schema_scan", scan_schema),
    ("form_scan", scan_form),
    ("mechanism_scan", scan_mechanisms),
    ("artefact_scan", scan_artefacts),
)


def _signal_key(signal: dict[str, Any]) -> tuple[str, int, str]:
    return (str(signal["path"]), int(signal["line"] or 0), str(signal["token"]))


def analyze_repo(root: Path, *, deadline_s: int = 120) -> dict[str, Any]:
    """Run all inventory modules inside one deadline and emit bounded facts."""
    deadline = time.monotonic() + max(1, deadline_s)
    facts: list[dict[str, Any]] = []
    detector_statuses: dict[str, str] = {}
    all_signals: list[dict[str, Any]] = []

    for expected_key, detector in _DETECTORS:
        if time.monotonic() >= deadline:
            result = ModuleResult(expected_key, [], "skipped")
        else:
            try:
                result = detector(root, deadline)
            except Exception:
                result = ModuleResult(expected_key, [], "failed")
        if result.key not in MODULE_KEYS or result.status not in DETECTOR_STATUSES:
            result = ModuleResult(expected_key, [], "failed")
        signals = sorted(result.signals, key=_signal_key)
        detector_statuses[result.key] = result.status
        facts.append({"key": result.key, "signals": signals, "detectedAt": utc_now()})
        all_signals.extend(signals)

    return {
        "inventoryVersion": INVENTORY_VERSION,
        "facts": facts,
        "signals": sorted(all_signals, key=_signal_key),
        "detectorStatuses": detector_statuses,
    }
