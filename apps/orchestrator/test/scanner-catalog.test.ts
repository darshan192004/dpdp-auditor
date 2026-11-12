import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';
import type { Mapping } from '../src/modules/rule-pack/rule-pack.schemas.js';
import {
  loadScannerCatalog,
  validateCatalog,
  type ScannerCatalog,
} from '../src/modules/rule-pack/scanner-catalog.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));

function mapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    scanner: 'semgrep',
    ruleId: 'dpdpa.python.pii-in-logs',
    scannerRuleVersion: '*',
    controlCode: 'DPDPA-8.4-LOG-01',
    confidence: 'direct',
    rationale: 'A PII-shaped value is passed to a logger.',
    remediationTemplate: null,
    ...overrides,
  };
}

function catalog(overrides: Partial<ScannerCatalog> = {}): ScannerCatalog {
  return {
    pack: 'dpdpa-2026.10.1',
    scanners: {
      semgrep: { version: '1.95.0', rules: ['dpdpa.python.pii-in-logs'] },
    },
    ...overrides,
  };
}

describe('validateCatalog (P4-13)', () => {
  it('accepts every mapping in the shipped pack', async () => {
    const [pack, scannerCatalog] = await Promise.all([
      loadRulePack(PACK_DIR),
      loadScannerCatalog(PACK_DIR),
    ]);

    expect(scannerCatalog.pack).toBe(pack.pack);
    expect(validateCatalog(pack.mappings, scannerCatalog)).toEqual([]);
  });

  it('rejects an unknown scanner rule ID', () => {
    expect(validateCatalog([mapping({ ruleId: 'dpdpa.python.removed' })], catalog())).toEqual([
      'unknown semgrep rule: dpdpa.python.removed',
    ]);
  });

  it('rejects an unknown scanner', () => {
    expect(
      validateCatalog(
        [mapping({ scanner: 'trivy' as unknown as Mapping['scanner'], ruleId: 'AVD-AWS-1' })],
        catalog(),
      ),
    ).toEqual(['unknown scanner: trivy']);
  });

  it('rejects an exact version that does not match the catalog', () => {
    expect(validateCatalog([mapping({ scannerRuleVersion: '1.90.0' })], catalog())).toEqual([
      'unpinned semgrep version for dpdpa.python.pii-in-logs: 1.90.0 (catalog 1.95.0)',
    ]);
  });

  it('accepts the pinned catalog version and the wildcard', () => {
    expect(
      validateCatalog(
        [mapping({ scannerRuleVersion: '1.95.0' }), mapping({ scannerRuleVersion: '*' })],
        catalog(),
      ),
    ).toEqual([]);
  });

  it('names the file when the catalog is malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dpdpa-catalog-'));
    try {
      await writeFile(join(dir, 'scanner-catalog.json'), '{ not json');
      await expect(loadScannerCatalog(dir)).rejects.toThrow(
        /scanner-catalog\.json is not valid JSON/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
