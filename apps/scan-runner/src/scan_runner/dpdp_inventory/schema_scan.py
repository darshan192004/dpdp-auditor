"""Schema and field-name detector. Emits tokens, never matched source text."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any, Final

from .paths import iter_files, read_lines
from .types import MAX_SIGNALS_PER_MODULE, ModuleResult, make_signal

FIELD_TOKENS: Final[tuple[str, ...]] = (
    "email",
    "phone",
    "full_name",
    "address",
    "date_of_birth",
    "aadhaar",
)
_FIELD_RE: Final = re.compile(r"\b(" + "|".join(FIELD_TOKENS) + r")\b", re.IGNORECASE)
_AUDIT_RE: Final = re.compile(r"\baudit_log\b", re.IGNORECASE)


def scan_schema(root: Path, deadline: float) -> ModuleResult:
    """Collect bounded field and audit-log signals from source files."""
    signals: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None, str]] = set()
    for path, relative in iter_files(root):
        if time.monotonic() >= deadline:
            return ModuleResult("schema_scan", signals, "skipped")
        for number, line in enumerate(read_lines(path), start=1):
            for token in _FIELD_RE.findall(line):
                key = (relative, number, f"pii_field.{token.lower()}")
                if key in seen:
                    continue
                seen.add(key)
                signals.append(make_signal("schema_scan", "field", relative, number, key[2]))
            if _AUDIT_RE.search(line):
                key = (relative, number, "audit_log")
                if key not in seen:
                    seen.add(key)
                    signals.append(
                        make_signal("schema_scan", "config", relative, number, "audit_log")
                    )
            if len(signals) >= MAX_SIGNALS_PER_MODULE:
                return ModuleResult("schema_scan", signals, "completed")
    return ModuleResult("schema_scan", signals, "completed")
