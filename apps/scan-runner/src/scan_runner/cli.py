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
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import httpx

from scan_runner.adapters import CheckovAdapter, GitleaksAdapter, SemgrepAdapter
from scan_runner.batches import BatchClient
from scan_runner.budgets import enforce_inventory_budget, remaining_inventory_budget_s
from scan_runner.callbacks import post_signed
from scan_runner.config import ALL_SCANNERS, SECRETS_ONLY_SCANNERS, Config
from scan_runner.dpdp_inventory import analyze_repo
from scan_runner.facts import collect_facts
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
        raw = adapter.run(workspace, timeout)
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


def send_progress(config: Config, client: httpx.Client | None = None) -> None:
    """Send the signed 'scanning' progress callback (P3-10 / api.md §10.4)."""
    payload = {"status": "scanning"}
    post_signed(
        config,
        f"/internal/v1/scans/{config.scan_id}/progress",
        payload,
        client=client,
    )
    log.info("progress 'scanning' accepted for scan %s", config.scan_id)


_TOKEN_RE = re.compile(r"^[A-Za-z0-9_.:/-]{1,120}$")
_PATH_RE = re.compile(r"^(?!/)(?!.*\.\.)[^\0]{1,240}$")
_INVENTORY_KINDS = frozenset(
    {
        "file",
        "symbol",
        "field",
        "route",
        "dependency",
        "config",
        "artefact",
        "region",
        "cookie",
        "header",
    }
)
_INVENTORY_KEYS = frozenset(
    {
        "schema_scan",
        "form_scan",
        "mechanism_scan",
        "artefact_scan",
        "dep_scan",
        "sdk_init_scan",
        "region_scan",
        "pii_literal_scan",
        "cookie_scan",
        "cmp_scan",
        "header_scan",
        "cms_scan",
    }
)
_INVENTORY_STATUSES = frozenset({"completed", "failed", "timed_out", "skipped"})


def _bounded_signal(value: object) -> dict[str, object] | None:
    """Keep only contract-shaped signal fields; drop everything else."""
    if not isinstance(value, dict):
        return None
    detector = value.get("detector")
    kind = value.get("kind")
    path = value.get("path")
    line = value.get("line")
    token = value.get("token")
    if not isinstance(detector, str) or not _TOKEN_RE.match(detector):
        return None
    if not isinstance(kind, str) or kind not in _INVENTORY_KINDS:
        return None
    if not isinstance(path, str) or not _PATH_RE.match(path):
        return None
    if not isinstance(line, int) or isinstance(line, bool) or not 1 <= line <= 100_000:
        return None
    if not isinstance(token, str) or not _TOKEN_RE.match(token):
        return None
    signal: dict[str, object] = {
        "detector": detector,
        "kind": kind,
        "path": path,
        "line": line,
        "token": token,
    }
    count = value.get("count")
    if isinstance(count, int) and not isinstance(count, bool) and 0 <= count <= 100_000:
        signal["count"] = count
    return signal


def sanitize_inventory(report: object) -> dict[str, object] | None:
    """Keep only contract-shaped inventory data before signing a callback."""
    if not isinstance(report, dict):
        return None
    if report.get("inventoryVersion") != "inventory-1.0.0":
        return None
    raw_facts = report.get("facts")
    raw_statuses = report.get("detectorStatuses")
    if not isinstance(raw_facts, list) or not isinstance(raw_statuses, dict):
        return None

    facts: list[dict[str, object]] = []
    for raw_fact in raw_facts[:12]:
        if not isinstance(raw_fact, dict):
            continue
        key = raw_fact.get("key")
        detected_at = raw_fact.get("detectedAt")
        raw_signals = raw_fact.get("signals")
        if key not in _INVENTORY_KEYS or not isinstance(detected_at, str):
            continue
        if not isinstance(raw_signals, list):
            continue
        signals = [
            signal
            for signal in (_bounded_signal(item) for item in raw_signals[:2000])
            if signal is not None
        ]
        facts.append({"key": key, "signals": signals, "detectedAt": detected_at})

    statuses = {
        key: value
        for key, value in raw_statuses.items()
        if isinstance(key, str) and _TOKEN_RE.match(key) and value in _INVENTORY_STATUSES
    }
    if not facts or not statuses:
        return None
    return {
        "inventoryVersion": "inventory-1.0.0",
        "facts": facts,
        "signals": [],
        "detectorStatuses": statuses,
    }


def send_completion(
    config: Config,
    statuses: dict[str, str],
    counts: dict[str, int],
    *,
    durations: dict[str, int] | None = None,
    commit_sha: str | None = None,
    workspace_bytes: int | None = None,
    facts: dict[str, list[str]] | None = None,
    inventory: dict[str, object] | None = None,
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
        # Applicability predicates evaluate against these (rules.md §13). An
        # empty set silently drops every conditional control from the score,
        # so the runner reports what the checkout actually holds.
        "facts": facts
        if facts is not None
        else {"languages": [], "frameworks": [], "resourceTypes": []},
    }
    if commit_sha:
        payload["commitSha"] = commit_sha
    if workspace_bytes is not None:
        payload["workspaceBytes"] = workspace_bytes
    sanitized = sanitize_inventory(inventory) if inventory is not None else None
    if sanitized is not None:
        payload["inventory"] = sanitized
    post_signed(
        config,
        f"/internal/v1/scans/{config.scan_id}/complete",
        payload,
        client=client,
    )
    log.info("completion accepted for scan %s", config.scan_id)


def run_scan(config: Config) -> int:
    workspace = Path(config.workspace)
    scan_started = time.monotonic()
    log.debug("scan timing anchor: %.3f", scan_started)
    statuses: dict[str, str] = {}
    counts: dict[str, int] = {}
    durations: dict[str, int] = {}
    batches: dict[str, BatchClient] = {
        name: BatchClient(config, scanner=name) for name in ALL_SCANNERS
    }
    exit_code = EXIT_OK

    try:
        clone_repository(config.repo_url, workspace, config.repo_ref, config.timeout_clone)

        # Notify orchestrator that cloning finished and scanning is starting.
        # Non-fatal: a lost callback must not fail an otherwise valid scan.
        with httpx.Client(timeout=10.0) as progress_client:
            try:
                send_progress(config, client=progress_client)
            except Exception as exc:
                log.warning("failed to send scanning progress callback: %s", exc)

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
        # Collect applicability facts from the checkout before it is deleted.
        # Scoring excludes any control whose predicate does not match these,
        # so a failure here must not lose the findings already uploaded.
        try:
            facts = collect_facts(workspace)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("fact collection failed: %s", exc)
            facts = {"languages": [], "frameworks": [], "resourceTypes": []}
        log.info(
            "repo facts: languages=%s frameworks=%s resourceTypes=%s",
            facts["languages"],
            facts["frameworks"],
            facts["resourceTypes"],
        )
        inventory_report: dict[str, object] | None = None
        # Bound inventory by the scan deadline remaining after earlier stages;
        # a full allowance here could finish after the 900-second scan deadline.
        inventory_budget_s = remaining_inventory_budget_s(time.monotonic() - scan_started)
        if inventory_budget_s <= 0:
            log.warning("no scan budget remains for inventory analysis")
            statuses["dpdp_inventory"] = "timed_out"
        else:
            try:
                inventory_started = time.monotonic()
                report = analyze_repo(workspace, deadline_s=inventory_budget_s)
                inventory_elapsed_s = time.monotonic() - inventory_started
                budget_result = enforce_inventory_budget(
                    inventory_elapsed_s, time.monotonic() - scan_started
                )
                if budget_result != "within_budget":
                    log.warning("inventory analyzer exceeded its time budget: %s", budget_result)
                    statuses["dpdp_inventory"] = "timed_out"
                    # The completion contract only serialises external scanner
                    # names, so record the budget failure in the inventory
                    # detector statuses that do reach the orchestrator.
                    detector_statuses = dict(report["detectorStatuses"])
                    detector_statuses["dpdp_inventory"] = "timed_out"
                    report["detectorStatuses"] = detector_statuses
                    exit_code = EXIT_FAILED
                log.info("inventory detector statuses: %s", report["detectorStatuses"])
                inventory_report = report
            except Exception as exc:  # pragma: no cover - defensive
                log.warning("inventory analysis failed: %s", exc)
                inventory_report = None
        send_completion(
            config,
            statuses,
            counts,
            durations=durations,
            commit_sha=read_commit_sha(workspace),
            workspace_bytes=total_workspace_bytes(workspace),
            facts=facts,
            inventory=inventory_report,
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
