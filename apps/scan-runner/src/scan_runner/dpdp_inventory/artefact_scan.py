"""Artefact-presence detector. Reads paths only, never artefact contents."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Final

from .paths import iter_artefacts
from .types import ModuleResult, make_signal

ARTEFACT_TOKENS: Final[dict[str, str]] = {
    "privacy-notice.md": "privacy_notice",
    "dsr-sop.md": "dsr_sop",
    "backup-policy.md": "backup_policy",
    "processor-list.md": "processor_list",
}


def scan_artefacts(root: Path, deadline: float) -> ModuleResult:
    """Collect bounded artefact tokens from repository paths."""
    signals: list[dict[str, object]] = []
    for path, relative in iter_artefacts(root):
        if time.monotonic() >= deadline:
            return ModuleResult("artefact_scan", signals, "skipped")
        token = ARTEFACT_TOKENS.get(path.name.lower())
        if token is None:
            continue
        signals.append(make_signal("artefact_scan", "artefact", relative, None, token, 1))
    return ModuleResult("artefact_scan", signals, "completed")
