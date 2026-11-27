"""Offline unit tests for the bounded DPDP inventory analyzer."""

from __future__ import annotations

import json
import time
from pathlib import Path

from scan_runner.dpdp_inventory.schema_scan import FIELD_TOKENS, scan_schema

CANARY = "CANARY_PHASE_C_SCHEMA_NEVER_EMIT"


def test_schema_scan_emits_allowlisted_tokens_without_matched_values(tmp_path: Path) -> None:
    (tmp_path / "model.py").write_text(
        f"# {CANARY}\nclass Profile:\n    email = None\n    audit_log = True\n",
        encoding="utf-8",
    )

    result = scan_schema(tmp_path, time.monotonic() + 60)

    assert result.status == "completed"
    assert [(signal["token"], signal["line"]) for signal in result.signals] == [
        ("pii_field.email", 3),
        ("audit_log", 4),
    ]
    assert CANARY not in json.dumps(result.signals, sort_keys=True)
    assert all(
        set(signal) <= {"detector", "kind", "path", "line", "token", "count"}
        for signal in result.signals
    )


def test_schema_scan_has_no_field_dictionary_drift() -> None:
    assert FIELD_TOKENS == ("email", "phone", "full_name", "address", "date_of_birth", "aadhaar")


def test_schema_scan_skips_work_after_deadline(tmp_path: Path) -> None:
    (tmp_path / "model.py").write_text("email = None\n", encoding="utf-8")

    result = scan_schema(tmp_path, time.monotonic() - 1)

    assert result.status == "skipped"
    assert result.signals == []
