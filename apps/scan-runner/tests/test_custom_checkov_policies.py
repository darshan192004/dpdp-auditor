"""Custom Checkov policy must fail the bad fixture and pass the good fixture."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CHECKS = ROOT / "packages/rule-packs/custom/checkov"
CHECK_ID = "ckv_dpdp_a_1"


def _failed_ids(fixture: Path) -> set[str]:
    result = subprocess.run(
        [
            "checkov",
            "-d",
            str(fixture),
            "--external-checks-dir",
            str(CHECKS),
            "--framework",
            "terraform",
            "--output",
            "json",
            "--quiet",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode in (0, 1), result.stderr
    report = json.loads(result.stdout)
    return {
        check["check_id"] for check in report["results"].get("failed_checks", [])
    }


def test_installed_checkov_matches_pin() -> None:
    output = subprocess.check_output(["checkov", "--version"], text=True).strip()
    version = output.split()[-1]
    assert version == "3.2.0", f"expected checkov 3.2.0, got {version}"


def test_custom_policy_fails_unencrypted_personal_data_bucket() -> None:
    assert CHECK_ID in _failed_ids(ROOT / "tests/golden-repos/fx-cmp-header")


def test_custom_policy_passes_encrypted_personal_data_bucket() -> None:
    assert CHECK_ID not in _failed_ids(ROOT / "tests/golden-repos/fx-gtm-web")
