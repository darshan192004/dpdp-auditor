"""Fail CI when scanner version pins drift between the image and catalogue.

The runner image ARG values, ``scan_runner.versions.PINNED_SCANNERS`` and
``packages/rule-packs/scanner-catalog.json`` must agree. A mismatch means the
adapters would report a different version than the binary that produced the
findings, so rule mappings could no longer be trusted (tasks.md P3-13).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = ROOT / "docker/scan-runner.Dockerfile"
CATALOG = ROOT / "packages/rule-packs/scanner-catalog.json"
ARG_PATTERN = re.compile(
    r"^ARG (?P<scanner>SEMGREP|CHECKOV|GITLEAKS)_VERSION=(?P<version>\S+)$",
    re.MULTILINE,
)


def _catalog_versions() -> dict[str, str]:
    """Return scanner versions from the rule-pack catalogue."""
    data: object = json.loads(CATALOG.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError(f"{CATALOG}: expected a JSON object")
    scanners = data.get("scanners")
    if not isinstance(scanners, dict):
        raise TypeError(f"{CATALOG}: expected a scanners object")

    versions: dict[str, str] = {}
    for name, entry in scanners.items():
        if not isinstance(name, str) or not isinstance(entry, dict):
            raise TypeError(f"{CATALOG}: invalid scanner entry")
        version = entry.get("version")
        if not isinstance(version, str):
            raise TypeError(f"{CATALOG}: scanner {name} has no version")
        versions[name] = version
    return versions


def _image_versions() -> dict[str, str]:
    """Return scanner versions pinned by the runner Dockerfile ARGs."""
    versions = {
        match.group("scanner").lower(): match.group("version")
        for match in ARG_PATTERN.finditer(DOCKERFILE.read_text(encoding="utf-8"))
    }
    expected = {"semgrep", "checkov", "gitleaks"}
    missing = expected - versions.keys()
    if missing:
        raise ValueError(f"{DOCKERFILE}: missing version ARG for {sorted(missing)}")
    return versions


def main() -> int:
    """Check all three version sources and print a concise result."""
    sys.path.insert(0, str(ROOT / "apps/scan-runner/src"))
    from scan_runner.versions import PINNED_SCANNERS

    catalogue = _catalog_versions()
    image = _image_versions()
    errors: list[str] = []

    for scanner, version in PINNED_SCANNERS.items():
        if catalogue.get(scanner) != version:
            errors.append(f"{scanner}: versions.py={version}, catalogue={catalogue.get(scanner)}")
        if image.get(scanner) != version:
            errors.append(f"{scanner}: versions.py={version}, image={image.get(scanner)}")

    if errors:
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        return 1

    pins = ", ".join(f"{name}=={version}" for name, version in PINNED_SCANNERS.items())
    print(f"scanner version pins aligned: {pins}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
