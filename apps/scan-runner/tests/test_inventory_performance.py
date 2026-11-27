"""Offline performance budget checks for the in-pod inventory analyzer."""

from __future__ import annotations

import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from scan_runner import cli
from scan_runner.budgets import (
    INVENTORY_BUDGET_SECONDS,
    SCAN_DEADLINE_SECONDS,
    enforce_inventory_budget,
)
from scan_runner.config import Config
from scan_runner.dpdp_inventory.analyzer import analyze_repo

CANARY = "CANARY_PHASE_F_PERF_NEVER_EMIT"
FILE_BYTES = 900 * 1024
FILE_COUNT = 120


def _make_large_repo(root: Path) -> Path:
    repo = root / "large"
    repo.mkdir(parents=True, exist_ok=True)
    chunk = (
        f"# {CANARY}\n"
        "def fixture_function(value):\n"
        "    return {'field': value, 'consent_gate': True}\n"
    ).encode()
    payload = (chunk * 30000)[:FILE_BYTES]
    for index in range(FILE_COUNT):
        (repo / f"module_{index:03d}.py").write_bytes(payload)
    return repo


def test_budget_constants_and_enforcement() -> None:
    assert INVENTORY_BUDGET_SECONDS == 120
    assert SCAN_DEADLINE_SECONDS == 900
    assert enforce_inventory_budget(119.9, 899.9) == "within_budget"
    assert enforce_inventory_budget(120.1, 899.9) == "inventory_over_budget"
    assert enforce_inventory_budget(119.9, 900.1) == "scan_over_budget"


def test_inventory_analyzer_finishes_100mb_repo_inside_budget(tmp_path: Path) -> None:
    repo = _make_large_repo(tmp_path)
    assert sum(path.stat().st_size for path in repo.iterdir()) > 100 * 1024 * 1024

    started = time.perf_counter()
    report = analyze_repo(repo, deadline_s=INVENTORY_BUDGET_SECONDS)
    elapsed = time.perf_counter() - started

    assert elapsed <= INVENTORY_BUDGET_SECONDS
    assert report["inventoryVersion"] == "inventory-1.0.0"
    assert set(report["detectorStatuses"].values()) <= {"completed", "skipped"}
    assert CANARY not in json.dumps(report, sort_keys=True)
    assert enforce_inventory_budget(elapsed, elapsed + 30.0) == "within_budget"


class _FakeBatchClient:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    def add(self, _finding: dict[str, object]) -> None:
        pass

    def finish(self) -> None:
        pass


def test_run_scan_applies_inventory_budget(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config = Config(
        scan_id="scan-phase-f-budget",
        orchestrator_url="http://orchestrator:3001",
        hmac_key=SecretStr("h" * 32),
        internal_key=SecretStr("i" * 32),
        org_id="org-1",
        repo_url="https://example.invalid/repository.git",
        repo_ref="main",
        workspace=str(tmp_path / "workspace"),
    )
    deadlines: list[int] = []

    def fake_analyze_repo(_root: Path, *, deadline_s: int) -> dict[str, object]:
        deadlines.append(deadline_s)
        return {
            "inventoryVersion": "inventory-1.0.0",
            "facts": [],
            "signals": [],
            "detectorStatuses": {},
        }

    statuses_seen: dict[str, str] = {}
    inventory_seen: dict[str, object] | None = None

    def fake_send_completion(
        _cfg: Config,
        statuses: dict[str, str],
        _counts: dict[str, int],
        **kwargs: object,
    ) -> None:
        nonlocal inventory_seen
        statuses_seen.update(statuses)
        inventory = kwargs.get("inventory")
        if isinstance(inventory, dict):
            inventory_seen = inventory

    def noop(*_args: object, **_kwargs: object) -> None:
        return None

    def fake_run_scanner(
        _name: str, _adapter: object, _workspace: Path, _timeout: int
    ) -> tuple[list[dict[str, object]], str, int]:
        return [], "completed", 1

    def fake_normalise(*_args: object, **_kwargs: object) -> list[dict[str, object]]:
        return []

    def fake_facts(_workspace: Path) -> dict[str, list[str]]:
        return {"languages": [], "frameworks": [], "resourceTypes": []}

    def fake_commit_sha(_workspace: Path) -> str:
        return "sha"

    def fake_workspace_bytes(_workspace: Path) -> int:
        return 1

    monotonic_values = iter([100.0, 100.0, 230.0, 230.0])
    monkeypatch.setattr(
        cli, "time", SimpleNamespace(monotonic=lambda: next(monotonic_values))
    )
    monkeypatch.setattr(cli, "clone_repository", noop)
    monkeypatch.setattr(cli, "send_progress", noop)
    monkeypatch.setattr(cli, "BatchClient", _FakeBatchClient)
    monkeypatch.setattr(cli, "run_scanner", fake_run_scanner)
    monkeypatch.setattr(cli, "normalize_findings", fake_normalise)
    monkeypatch.setattr(cli, "collect_facts", fake_facts)
    monkeypatch.setattr(cli, "analyze_repo", fake_analyze_repo)
    monkeypatch.setattr(cli, "read_commit_sha", fake_commit_sha)
    monkeypatch.setattr(cli, "total_workspace_bytes", fake_workspace_bytes)
    monkeypatch.setattr(cli, "send_completion", fake_send_completion)

    assert cli.run_scan(config) == 0
    assert deadlines == [INVENTORY_BUDGET_SECONDS]
    assert inventory_seen is not None
    assert statuses_seen["dpdp_inventory"] == "timed_out"
