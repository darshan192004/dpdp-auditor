"""Time budgets for the in-pod inventory analyzer and the whole scan."""

from __future__ import annotations

from typing import Final

INVENTORY_BUDGET_SECONDS: Final = 120
SCAN_DEADLINE_SECONDS: Final = 900


def enforce_inventory_budget(inventory_elapsed_s: float, scan_elapsed_s: float) -> str:
    """Return the first exceeded budget, or 'within_budget'."""
    if scan_elapsed_s > SCAN_DEADLINE_SECONDS:
        return "scan_over_budget"
    if inventory_elapsed_s > INVENTORY_BUDGET_SECONDS:
        return "inventory_over_budget"
    return "within_budget"


def remaining_inventory_budget_s(scan_elapsed_s: float) -> int:
    """Return the inventory allowance bounded by the remaining scan deadline."""
    remaining_s = SCAN_DEADLINE_SECONDS - scan_elapsed_s
    return max(0, min(INVENTORY_BUDGET_SECONDS, int(remaining_s)))
