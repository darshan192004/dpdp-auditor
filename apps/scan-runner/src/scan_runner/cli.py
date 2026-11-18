"""Scan-runner entry point.

Stage sequencing per P3-02:

1. Validate environment and workspace (``Config.from_env``).
2. Clone the target repository (depth-1, single-branch, no submodules).
3. Run each pinned scanner through its adapter.
4. Normalise findings and stream them to the orchestrator in signed batches.
5. Send the signed completion callback.
6. Delete the workspace on every exit path.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import httpx

from scan_runner.adapters import CheckovAdapter, GitleaksAdapter, SemgrepAdapter
from scan_runner.batches import BatchClient
from scan_runner.callbacks import post_signed
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
    name: str,
    adapter: SemgrepAdapter | CheckovAdapter | GitleaksAdapter,
    workspace: Path,
    timeout: int,
) -> tuple[list[dict[str, Any]], str, int]:
    """Run one scanner and return (findings, status, duration_ms).

    Status is one of ``completed``, ``failed``, ``timed_out``.
    """
    start = time.monotonic()
    try:
        raw = adapter.run(workspace)
    except TimeoutError:
        duration_ms = int((time.monotonic() - start) * 1000)
        log.warning("scanner %s timed out after %ds", name, timeout)
        return [], "timed_out", duration_ms
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        log.warning("scanner %s failed: %s", name, type(exc).__name__)
        return [], "failed", duration_ms

    findings = adapter.normalize(raw)
    duration_ms = int((time.monotonic() - start) * 1000)
    log.info(
        "scanner %s produced %d findings in %.1fs",
        name,
        len(findings),
        duration_ms / 1000,
    )
    return findings, "completed", duration_ms


def read_commit_sha(workspace: Path) -> str | None:
    """Return the cloned commit SHA for the completion callback."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=workspace,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    sha = result.stdout.strip()
    return sha if len(sha) == 40 else None


def total_workspace_bytes(workspace: Path) -> int:
    """Return the total size of files in the workspace."""
    if not workspace.exists():
        return 0
    return sum(path.stat().st_size for path in workspace.rglob("*") if path.is_file())


def send_completion(
    config: Config,
    statuses: dict[str, str],
    counts: dict[str, int],
    *,
    durations: dict[str, int] | None = None,
    commit_sha: str | None = None,
    workspace_bytes: int | None = None,
    client: httpx.Client | None = None,
) -> None:
    """Send the signed final completion callback (P3-10)."""
    durations = durations or {}
    payload: dict[str, Any] = {
        "scanners": [
            {
                "name": name,
                "status": statuses.get(name, "failed"),
                "version": SCANNER_VERSIONS[name],
                "durationMs": durations.get(name, 0),
                "findings": counts.get(name, 0),
            }
            for name in ALL_SCANNERS
        ],
        "facts": {"languages": [], "frameworks": [], "resourceTypes": []},
    }
    if commit_sha:
        payload["commitSha"] = commit_sha
    if workspace_bytes is not None:
        payload["workspaceBytes"] = workspace_bytes
    post_signed(
        config,
        f"/internal/v1/scans/{config.scan_id}/complete",
        payload,
        client=client,
    )
    log.info("completion accepted for scan %s", config.scan_id)


def run_scan(config: Config) -> int:
    workspace = Path(config.workspace)
    statuses: dict[str, str] = {}
    counts: dict[str, int] = {}
    durations: dict[str, int] = {}
    batches: dict[str, BatchClient] = {
        name: BatchClient(config, scanner=name) for name in ALL_SCANNERS
    }
    exit_code = EXIT_OK

    try:
        clone_repository(config.repo_url, workspace, config.repo_ref, config.timeout_clone)

        timeouts = {
            "semgrep": config.timeout_semgrep,
            "checkov": config.timeout_checkov,
            "gitleaks": config.timeout_gitleaks,
        }
        adapters: dict[str, SemgrepAdapter | CheckovAdapter | GitleaksAdapter] = {
            "semgrep": SemgrepAdapter(),
            "checkov": CheckovAdapter(),
            "gitleaks": GitleaksAdapter(),
        }
        for name in ALL_SCANNERS:
            findings, status, duration_ms = run_scanner(
                name, adapters[name], workspace, timeouts[name]
            )
            statuses[name] = status
            durations[name] = duration_ms
            if status != "completed" and name in SECRETS_ONLY_SCANNERS:
                # Secrets scanner failures never block a clean report.
                pass
            if status == "timed_out":
                exit_code = EXIT_FAILED

            normalised = normalize_findings(name, findings, workspace, salt=config.scan_id)
            for finding in normalised:
                batches[name].add(finding)
            counts[name] = len(findings)
            if name not in SCANNER_VERSIONS:
                log.warning("scanner %s version not pinned in catalog", name)

        for batch in batches.values():
            batch.finish()
        send_completion(
            config,
            statuses,
            counts,
            durations=durations,
            commit_sha=read_commit_sha(workspace),
            workspace_bytes=total_workspace_bytes(workspace),
        )
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
