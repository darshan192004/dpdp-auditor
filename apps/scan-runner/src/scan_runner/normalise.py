"""Utilities for normalising scanner outputs into internal finding format."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def calculate_fingerprint(content: str, salt: str) -> str:
    """Return SHA-256 of *salt* + *content* (used for finding fingerprints)."""
    return hashlib.sha256((salt + content).encode("utf-8")).hexdigest()


def normalize_findings(
    scanner: str,
    raw_list: list[dict[str, Any]],
    repo_path: Path,  # noqa: ARG001 - reserved for relative-path computation
    *,
    salt: str = "",
) -> list[dict[str, Any]]:
    """Normalise a list of raw findings from a single scanner.

    Each returned dict contains:

    * ``scanner`` – the source scanner identifier
    * ``rule_id`` – the original rule identifier
    * ``severity`` – one of ``low``, ``medium``, ``high``, ``critical``
    * ``file`` – relative path to the offending file
    * ``line`` – line number (0 when unknown)
    * ``description`` – human-readable description
    * ``evidence`` – raw snippet (redacted for secrets)
    * ``fingerprint`` – SHA-256 of the normalised content
    * ``metadata`` – scanner-specific extra fields
    """
    results: list[dict[str, Any]] = []
    for raw in raw_list:
        # Extract common fields; fall back to safe defaults
        rule_id = raw.get("rule_id") or raw.get("RuleID") or "unknown"
        severity = raw.get("severity") or raw.get("Severity") or "medium"
        filepath = raw.get("file") or raw.get("File") or ""
        line = raw.get("line") or raw.get("Start", {}).get("Line", 0)
        description = raw.get("message") or raw.get("description") or ""
        evidence = raw.get("evidence") or raw.get("Match", "")
        metadata = {
            k: v
            for k, v in raw.items()
            if k
            not in (
                "rule_id",
                "RuleID",
                "severity",
                "Severity",
                "file",
                "File",
                "line",
                "message",
                "description",
                "evidence",
                "Match",
            )
        }

        # Build fingerprintable content
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
                "metadata": metadata,
            }
        )
    return results
