import type { DetectorStatus } from '@dpdpa/contracts';

export type InventoryStatus = 'completed' | 'partial' | 'failed' | null;

/** Small deterministic summary stored on `scans.inventoryStatus`. */
export function inventoryStatusFor(
  statuses: Readonly<Record<string, DetectorStatus>>,
): InventoryStatus {
  const values = Object.values(statuses);
  if (values.length === 0) return null;
  if (values.includes('failed')) return 'failed';
  return values.every((value) => value === 'completed') ? 'completed' : 'partial';
}
