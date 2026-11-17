"""Scanner version pins shared by the image, the adapters and the parity check.

The pins are the single source of truth for "which scanner binary does this
runner assume". `docker/scan-runner.Dockerfile` installs exactly these
versions, the adapters report them in every callback, and
`scripts/check_versions.py` fails CI when the image, the pins or the rule-pack
catalogue drift apart (tasks.md P3-13).
"""

from __future__ import annotations

from typing import Final

# Kept in lockstep with packages/rule-packs/scanner-catalog.json. Bumping a pin
# requires a rule-pack review because the mappings are versioned per scanner.
PINNED_SCANNERS: Final[dict[str, str]] = {
    "semgrep": "1.95.0",
    "checkov": "3.2.0",
    "gitleaks": "8.21.0",
}

# Registry packs are pinned by reference *and* by the Semgrep release that
# resolved them; `packs.lock.yaml` records the resolved digest for audit.
SEMGREP_REGISTRY_PACKS: Final[tuple[str, ...]] = (
    "p/python",
    "p/secrets",
    "p/owasp-top-ten",
)


def pinned_version(scanner: str) -> str:
    """Return the pinned version for `scanner`, or raise for an unknown id."""
    try:
        return PINNED_SCANNERS[scanner]
    except KeyError as exc:  # pragma: no cover - defensive, ids are literals
        raise KeyError(f"no pinned version for scanner {scanner!r}") from exc


SCANNER_VERSIONS: Final[dict[str, str]] = PINNED_SCANNERS
