"""Utilities for normalising scanner outputs into internal finding format."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def calculate_fingerprint(content: str, salt: str) -> str:
    """Return SHA-256 of *salt* + *content* (used for finding fingerprints)."""
    return hashlib.sha256((salt + content).encode("utf-8")).hexdigest()


# Each scanner emits a different JSON dialect (Semgrep nests under ``extra``,
# Checkov uses ``check_id``/``repo_path``, Gitleaks uses PascalCase). These alias
# tables translate the real raw shapes into one internal finding shape.
_ALIASES: dict[str, dict[str, tuple[str, ...]]] = {
    "semgrep": {
        "rule_id": ("check_id", "rule_id", "RuleID"),
        "file": ("path", "file", "File"),
        "line": ("start.line", "line", "Start.Line"),
        "description": ("extra.message", "message", "description"),
        "severity": ("extra.severity", "severity", "Severity"),
        "evidence": ("extra.lines", "evidence", "Match"),
    },
    "checkov": {
        "rule_id": ("check_id", "checkId", "rule_id", "RuleID"),
        "file": ("repo_path", "file_path", "file", "File"),
        "line": ("file_line_range.0", "line_number", "line", "Start.Line"),
        "description": ("message", "description", "check_name", "check_id"),
        "severity": ("severity", "Severity"),
        "evidence": ("code_block.0", "evidence", "Match"),
    },
    "gitleaks": {
        "rule_id": ("RuleID", "rule_id", "check_id"),
        "file": ("File", "file", "path"),
        "line": ("StartLine", "line", "start.line"),
        "description": ("Description", "message", "description"),
        "severity": ("Severity", "severity"),
        "evidence": ("Match", "evidence", "Secret"),
    },
}

_SEVERITY_ALIASES: dict[str, str] = {
    "error": "high",
    "warning": "medium",
    "warn": "medium",
    "fail": "medium",
    "informational": "info",
}


def _at_path(value: object, path: str) -> object:
    """Read a possibly nested field (``start.line``) or list index (``range.0``)."""
    current = value
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, (list, tuple)) and part.isdigit():
            index = int(part)
            current = current[index] if index < len(current) else None
        else:
            return None
    return current


def _first(raw: dict[str, Any], paths: tuple[str, ...]) -> object:
    for path in paths:
        value = _at_path(raw, path)
        if value is not None and value != "" and value != [] and value != {}:
            return value
    return None


def _non_negative_int(value: object) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    if isinstance(value, str):
        try:
            return max(0, int(value))
        except ValueError:
            return 0
    return 0


def _severity(value: object) -> str:
    text = str(value or "").strip().lower().replace("_", "-")
    if text in ("critical", "high", "medium", "low", "info"):
        return text
    return _SEVERITY_ALIASES.get(text, "medium")


def normalize_findings(
    scanner: str,
    raw_list: list[dict[str, Any]],
    repo_path: Path,  # noqa: ARG001 - reserved for relative-path computation
    *,
    salt: str = "",
) -> list[dict[str, Any]]:
    """Normalise a list of raw findings from a single scanner.

    The internal shape is the one consumed by ``batches.to_api_finding``:
    ``rule_id``, ``severity``, ``file``, ``line``, ``description``, ``evidence``
    and a stable ``fingerprint``. Every field is guaranteed to be present and
    ``description`` is never empty, so the signed batch callback always passes
    the orchestrator's strict validation.
    """
    fields = _ALIASES.get(scanner, _ALIASES["semgrep"])
    results: list[dict[str, Any]] = []
    for raw in raw_list:
        rule_id = str(_first(raw, fields["rule_id"]) or "unknown")
        filepath = str(_first(raw, fields["file"]) or "")
        line = _non_negative_int(_first(raw, fields["line"]))
        severity = _severity(_first(raw, fields["severity"]))
        description = str(_first(raw, fields["description"]) or "")
        if not description:
            description = f"{rule_id} finding at {filepath or 'unknown path'}"
        evidence = _first(raw, fields["evidence"])

        fp_content = json.dumps(
            {"scanner": scanner, "rule_id": rule_id, "file": filepath, "line": line},
            sort_keys=True,
        )
        fingerprint = calculate_fingerprint(fp_content, salt)

        results.append(
            {
                "scanner": scanner,
                "rule_id": rule_id,
                "severity": severity,
                "file": filepath,
                "line": line,
                "description": description,
                "evidence": evidence,
                "fingerprint": fingerprint,
                "metadata": {},
            }
        )
    return results
