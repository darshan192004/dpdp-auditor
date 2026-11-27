"""Custom scanner rule pins must match the image and adapter pins."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_semgrep_custom_rules_pin_the_pinned_version() -> None:
    raw = (ROOT / "packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml").read_text()
    pins = (ROOT / "apps/scan-runner/src/scan_runner/versions.py").read_text()
    assert re.search(r'^# semgrep==1\.95\.0$', raw, re.MULTILINE)
    assert '"semgrep": "1.95.0"' in pins


def test_checkov_custom_rules_pin_the_pinned_version() -> None:
    raw = (
        ROOT / "packages/rule-packs/custom/checkov/dpdp_security_checks.py"
    ).read_text()
    pins = (ROOT / "apps/scan-runner/src/scan_runner/versions.py").read_text()
    assert re.search(r'^# checkov==3\.2\.0$', raw, re.MULTILINE)
    assert '"checkov": "3.2.0"' in pins


def test_installed_semgrep_matches_pin() -> None:
    version = subprocess.check_output(["semgrep", "--version"], text=True).strip()
    assert version == "1.95.0", f"expected semgrep 1.95.0, got {version}"
