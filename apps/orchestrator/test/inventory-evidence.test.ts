import { describe, expect, it } from 'vitest';

import {
  inventoryEvidence,
  type InventoryReportLike,
} from '../src/modules/scoring/inventory-evidence.js';
import type { InventoryRule } from '../src/modules/rule-pack/rule-pack.loader.js';

const rules: InventoryRule[] = [
  {
    controlCode: 'DPDPA-8.4-MON-01',
    detector: 'schema_scan',
    token: 'audit_log',
    mode: 'absence',
    confidence: 'direct',
    pathHint: 'schema.py',
  },
  {
    controlCode: 'DPDPA-6-CONSENTGATE-01',
    detector: 'form_scan',
    token: 'consent_gate',
    mode: 'positive',
    confidence: 'direct',
  },
];

function report(signals: InventoryReportLike['signals']): InventoryReportLike {
  return {
    inventoryVersion: 'inventory-1.0.0',
    facts: [{ key: 'schema_scan', signals, detectedAt: '2026-11-27T00:00:00Z' }],
    signals,
    detectorStatuses: { schema_scan: 'completed', form_scan: 'completed' },
  };
}

describe('inventoryEvidence', () => {
  it('emits positive findings only for observed allowlisted tokens', () => {
    const evidence = inventoryEvidence({
      report: report([
        {
          detector: 'form_scan',
          kind: 'config',
          path: 'app.js',
          line: 1,
          token: 'consent_gate',
        },
      ]),
      rules,
      detectorStatuses: { schema_scan: 'completed', form_scan: 'completed' },
    });

    expect(evidence).toEqual([
      expect.objectContaining({
        controlCode: 'DPDPA-6-CONSENTGATE-01',
        kind: 'positive',
        scanner: 'form_scan',
        scannerRuleId: 'consent_gate',
        confidence: 'direct',
      }),
    ]);
  });

  it('emits missing_control only when a need signal exists', () => {
    const withNeed = report([
      {
        detector: 'schema_scan',
        kind: 'field',
        path: 'model.py',
        line: 2,
        token: 'pii_field.email',
      },
    ]);
    const withoutNeed = report([]);
    const statuses = { schema_scan: 'completed', form_scan: 'completed' } as const;

    expect(inventoryEvidence({ report: withNeed, rules, detectorStatuses: statuses })).toEqual([
      expect.objectContaining({
        controlCode: 'DPDPA-8.4-MON-01',
        kind: 'missing_control',
        scanner: 'schema_scan',
        filePath: 'schema.py',
        confidence: 'direct',
      }),
    ]);
    expect(inventoryEvidence({ report: withoutNeed, rules, detectorStatuses: statuses })).toEqual(
      [],
    );
  });

  it('emits nothing when the required detector did not complete', () => {
    const evidence = inventoryEvidence({
      report: report([]),
      rules,
      detectorStatuses: { schema_scan: 'skipped', form_scan: 'completed' },
    });

    expect(evidence).toEqual([]);
  });
});
