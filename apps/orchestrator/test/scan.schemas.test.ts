import { describe, expect, it } from 'vitest';

import { completeScanSchema, repoFactsSchema } from '../src/modules/scans/scan.schemas.js';

describe('repoFactsSchema', () => {
  it('accepts more than 500 distinct resource types without dropping them', () => {
    const resourceTypes = Array.from({ length: 501 }, (_, index) => `aws_resource_${index}`);

    const facts = repoFactsSchema.parse({
      languages: [],
      frameworks: [],
      resourceTypes,
    });

    expect(facts.resourceTypes).toEqual(resourceTypes);
  });
});

it('accepts a bounded inventory completion payload and rejects source-shaped fields', () => {
  const inventory = {
    inventoryVersion: 'inventory-1.0.0',
    facts: [
      {
        key: 'schema_scan',
        signals: [
          {
            detector: 'schema_scan',
            kind: 'config',
            path: 'model.py',
            line: 4,
            token: 'audit_log',
          },
        ],
        detectedAt: '2026-11-27T00:00:00Z',
      },
    ],
    signals: [],
    detectorStatuses: { schema_scan: 'completed' },
  };

  const parsed = completeScanSchema.parse({
    scanners: [{ name: 'semgrep', status: 'completed', findings: 0 }],
    facts: { languages: [], frameworks: [], resourceTypes: [] },
    inventory,
  });
  expect(parsed.inventory).toEqual(inventory);

  expect(() =>
    completeScanSchema.parse({
      scanners: [{ name: 'semgrep', status: 'completed', findings: 0 }],
      inventory: { ...inventory, raw: 'CANARY_PHASE_C_DB_NEVER_EMIT' },
    }),
  ).toThrow();
});
