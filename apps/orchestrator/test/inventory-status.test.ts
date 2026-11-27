import { describe, expect, it } from 'vitest';

import { inventoryStatusFor } from '../src/modules/scans/inventory-status.js';

describe('inventoryStatusFor', () => {
  it('maps detector statuses to a scan inventory status', () => {
    expect(inventoryStatusFor({ schema_scan: 'completed' })).toBe('completed');
    expect(inventoryStatusFor({ schema_scan: 'completed', form_scan: 'skipped' })).toBe('partial');
    expect(inventoryStatusFor({ schema_scan: 'failed' })).toBe('failed');
    expect(inventoryStatusFor({})).toBeNull();
  });
});
