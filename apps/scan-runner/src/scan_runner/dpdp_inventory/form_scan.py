"""Collection-form detector. Emits fixed tokens and bounded locations only."""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Final

from .paths import iter_files, read_lines
from .schema_scan import FIELD_TOKENS
from .types import MAX_SIGNALS_PER_MODULE, ModuleResult, make_signal

_CONSENT_RE: Final = re.compile(r"\bconsent(?:Gate|_gate)?\b", re.IGNORECASE)
_PURPOSE_RE: Final = re.compile(r"\bpurpose(?:Statement|_statement)?\b", re.IGNORECASE)
_PRIVACY_RE: Final = re.compile(r"\bprivacy[-_]?notice(?:[-_]?link)?\b", re.IGNORECASE)
_FIELD_RE: Final = re.compile(r"\b(" + "|".join(FIELD_TOKENS) + r")\b", re.IGNORECASE)


def scan_form(root: Path, deadline: float) -> ModuleResult:
    """Collect form-purpose, consent-link, and allowlisted field tokens."""
    signals: list[dict[str, object]] = []
    seen: set[tuple[str, int | None, str]] = set()
    for path, relative in iter_files(root):
        if time.monotonic() >= deadline:
            return ModuleResult("form_scan", signals, "skipped")
        for number, line in enumerate(read_lines(path), start=1):
            candidates: list[tuple[str, str]] = []
            if _CONSENT_RE.search(line):
                candidates.append(("config", "consent_gate"))
            if _PURPOSE_RE.search(line):
                candidates.append(("config", "purpose_statement"))
            if _PRIVACY_RE.search(line):
                candidates.append(("route", "privacy_notice_link"))
            for field in _FIELD_RE.findall(line):
                candidates.append(("field", f"pii_field.{field.lower()}"))
            for kind, token in candidates:
                key = (relative, number, token)
                if key in seen:
                    continue
                seen.add(key)
                signals.append(make_signal("form_scan", kind, relative, number, token))
                if len(signals) >= MAX_SIGNALS_PER_MODULE:
                    return ModuleResult("form_scan", signals, "completed")
    return ModuleResult("form_scan", signals, "completed")
