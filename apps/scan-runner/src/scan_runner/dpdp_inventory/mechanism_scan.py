"""Privacy-mechanism detector. Emits fixed mechanism tokens only."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Final

from .paths import iter_files, read_lines
from .types import MAX_SIGNALS_PER_MODULE, ModuleResult, make_signal

_PATTERNS: Final[tuple[tuple[re.Pattern[str], str], ...]] = (
    (re.compile(r"\bconsent(?:Gate|_gate)\b", re.IGNORECASE), "consent_gate_mechanism"),
    (
        re.compile(r"\bconsent(?:Withdrawal|_withdrawal)\b", re.IGNORECASE),
        "consent_withdrawal",
    ),
    (re.compile(r"\baudit(?:Log|_log)\b", re.IGNORECASE), "audit_log_mechanism"),
)


def scan_mechanisms(root: Path, deadline: float) -> ModuleResult:
    """Collect allowlisted mechanism tokens from source files."""
    signals: list[dict[str, object]] = []
    seen: set[tuple[str, int | None, str]] = set()
    for path, relative in iter_files(root):
        if time.monotonic() >= deadline:
            return ModuleResult("mechanism_scan", signals, "skipped")
        for number, line in enumerate(read_lines(path), start=1):
            for pattern, token in _PATTERNS:
                if not pattern.search(line):
                    continue
                key = (relative, number, token)
                if key in seen:
                    continue
                seen.add(key)
                signals.append(make_signal("mechanism_scan", "symbol", relative, number, token))
                if len(signals) >= MAX_SIGNALS_PER_MODULE:
                    return ModuleResult("mechanism_scan", signals, "completed")
    return ModuleResult("mechanism_scan", signals, "completed")
