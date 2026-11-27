"""Offline unit tests for the bounded DPDP inventory analyzer."""

from __future__ import annotations

import json
import time
from pathlib import Path

from scan_runner.dpdp_inventory.analyzer import analyze_repo
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


def _copy_fixture(tmp_path: Path, name: str) -> Path:
    source = Path(__file__).resolve().parents[3] / "tests" / "golden-repos" / name
    target = tmp_path / name
    target.mkdir(parents=True)
    for path in source.iterdir():
        if path.is_file():
            (target / path.name).write_bytes(path.read_bytes())
    return target


def test_analyzer_reports_good_fixture_signals(tmp_path: Path) -> None:
    report = analyze_repo(_copy_fixture(tmp_path, "fx-good-app"), deadline_s=60)

    assert report["inventoryVersion"] == "inventory-1.0.0"
    assert report["detectorStatuses"] == {
        "schema_scan": "completed",
        "form_scan": "completed",
        "mechanism_scan": "completed",
        "artefact_scan": "completed",
    }
    tokens = {signal["token"] for signal in report["signals"]}
    assert {
        "pii_field.email",
        "consent_gate",
        "consent_gate_mechanism",
        "purpose_statement",
        "privacy_notice_link",
        "audit_log",
        "privacy_notice",
        "backup_policy",
    } <= tokens
    assert CANARY not in json.dumps(report, sort_keys=True)


def test_analyzer_has_no_need_signal_for_silent_fixture(tmp_path: Path) -> None:
    report = analyze_repo(_copy_fixture(tmp_path, "fx-silent-app"), deadline_s=60)

    assert report["signals"] == []
    assert all(fact["signals"] == [] for fact in report["facts"])


def test_analyzer_signal_output_is_deterministic(tmp_path: Path) -> None:
    repo = _copy_fixture(tmp_path, "fx-bad-app")
    first = analyze_repo(repo, deadline_s=60)
    second = analyze_repo(repo, deadline_s=60)

    assert first["signals"] == second["signals"]
    assert [fact["key"] for fact in first["facts"]] == [fact["key"] for fact in second["facts"]]
