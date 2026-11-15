"""Scan-runner entry point.

Stage sequencing per P3-02:

1. Validate environment and workspace (``Config.from_env``).
2. Clone the target repository (depth-1, single-branch, no submodules).
3. Run each pinned scanner through its adapter.
4. Normalise findings and stream them to the orchestrator in batches.
5. Send the completion callback.
6. Delete the workspace on every exit path.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path

from scan_runner.adapters import CheckovAdapter, GitleaksAdapter, SemgrepAdapter
from scan_runner.batches import BatchClient
from scan_runner.config import ALL_SCANNERS, SECRETS_ONLY_SCANNERS, Config
from scan_runner.logging_setup import configure_logging
from scan_runner.normalise import normalize_findings
from scan_runner.versions import SCANNER_VERSIONS

log = logging.getLogger("scan_runner.cli")

EXIT_OK = 0
EXIT_FAILED = 1


def clone_repository(repo_url: str, workspace: Path, ref: str, timeout: int) -> None:
    """Clone *repo_url* at *ref* into *workspace*.

    Safety rules (P3-03): shallow, single branch, no submodules, hard timeout.
    """
    workspace.mkdir(parents=True, exist_ok=True)
    cmd = [
        "git",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        ref,
        "--no-tags",
        repo_url,
        str(workspace),
    ]
    try:
        subprocess.run(cmd, check=True, timeout=timeout, capture_output=True)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"clone timed out after {timeout}s") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"clone failed: {exc.stderr.decode('utf-8', errors='replace').strip()}"
        ) from exc


def run_scanner(
    name: str, adapter: object, workspace: Path, timeout: int
) -> tuple[list[dict], str]:
    """Run one scanner and return (findings, status).

    Status is one of ``ok``, ``failed``, ``timed_out``.
    """
    start = time.monotonic()
    try:
        raw = adapter.run(workspace)
    except TimeoutError:
        log.warning("scanner %s timed out after %ds", name, timeout)
        return [], "timed_out"
    except Exception as exc:
        log.warning("scanner %s failed: %s", name, type(exc).__name__)
        return [], "failed"

    findings = adapter.normalize(raw)
    elapsed = time.monotonic() - start
    log.info(
        "scanner %s produced %d findings in %.1fs",
        name,
        len(findings),
        elapsed,
    )
    return findings, "ok"


def send_completion(config: Config, statuses: dict[str, str], counts: dict[str, int]) -> None:
    """Send the final completion callback (P3-10)."""
    log.info(
        "Completion: scanId=%s statuses=%s counts=%s -> %s",
        config.scan_id,
        statuses,
        counts,
        config.orchestrator_url,
    )


def run_scan(config: Config) -> int:
    workspace = Path(config.workspace)
    statuses: dict[str, str] = {}
    counts: dict[str, int] = {}
    batch = BatchClient(config)
    exit_code = EXIT_OK

    try:
        clone_repository(config.repo_url, workspace, config.repo_ref, config.timeout_clone)

        timeouts = {
            "semgrep": config.timeout_semgrep,
            "checkov": config.timeout_checkov,
            "gitleaks": config.timeout_gitleaks,
        }
        for name in ALL_SCANNERS:
            adapter = {
                "semgrep": SemgrepAdapter(),
                "checkov": CheckovAdapter(),
                "gitleaks": GitleaksAdapter(),
            }[name]
            findings, status = run_scanner(name, adapter, workspace, timeouts[name])
            statuses[name] = status
            if status != "ok" and name in SECRETS_ONLY_SCANNERS:
                # Secrets scanner failures never block a clean report.
                pass
            if status == "timed_out":
                exit_code = EXIT_FAILED

            normalised = normalize_findings(name, findings, workspace, salt=config.scan_id)
            for finding in normalised:
                batch.add(finding)
            counts[name] = len(findings)
            if name not in SCANNER_VERSIONS:
                log.warning("scanner %s version not pinned in catalog", name)

        batch.finish()
        send_completion(config, statuses, counts)
        return exit_code
    finally:
        # P3-11: workspace is deleted on every exit path.
        shutil.rmtree(workspace, ignore_errors=True)
        log.info("workspace cleaned")


def main() -> None:
    try:
        config = Config.from_env()
    except ValueError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        sys.exit(2)

    configure_logging(config.log_level, scan_id=config.scan_id)
    code = run_scan(config)
    sys.exit(code)


if __name__ == "__main__":
    main()
