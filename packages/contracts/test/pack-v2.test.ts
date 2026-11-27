import { describe, expect, it } from 'vitest';
import * as contracts from '../src/index';
import {
  attestationSchema,
  controlV2Schema,
  detectorV2Schema,
  DPDPA_PACK_V2_VERSION,
  INVENTORY_V1_VERSION,
  inventorySignalSchema,
  validatePackV2,
} from '../src/pack-v2';

const validControl = {
  code: 'DPDPA-8.4-SECRET-01',
  section: '8(4)',
  actRef: 'DPDPA Section 8(4)',
  ruleRef: 'reasonable-security-safeguards',
  title: 'Secrets are not stored in source',
  severity: 'critical',
  weight: 5,
  evidenceMode: 'manual',
  appliesWhen: [],
  violationRules: [],
  absenceRules: [],
  positiveRules: [],
  partialCredit: false,
  remediationKey: 'remove-hardcoded-secrets',
  legalRefs: ['DPDPA Section 8(4)', 'DPDP Rules 4'],
};

const validDetector = {
  id: 'schema_scan',
  module: 'inventory',
  inputs: ['source'],
  outputs: ['fact', 'status'],
  timeoutMs: 30_000,
  stacks: [],
  confidence: 'inferred',
  failureMode: 'UNKNOWN',
  controlRefs: [],
};

const validCommencement = {
  version: 1,
  pack: DPDPA_PACK_V2_VERSION,
  entries: [
    {
      provision: 'DPDPA Section 5',
      effectiveFrom: '2026-11-13',
      sourceUrl: 'https://www.meity.gov.in/sample.pdf',
      verifiedOn: '2026-11-26',
    },
  ],
};

interface PackFixture {
  files: Array<{ path: string; value: unknown; sha256: string }>;
  manifest: unknown;
}

function packFixture(
  overrides: {
    control?: unknown;
    detector?: unknown;
    commencement?: unknown;
    mapping?: unknown;
    driftPath?: string;
  } = {},
): PackFixture {
  const controls = {
    version: 1,
    pack: DPDPA_PACK_V2_VERSION,
    effectiveFrom: '2026-11-15',
    controls: [overrides.control ?? validControl],
  };
  const detectors = {
    version: 1,
    pack: DPDPA_PACK_V2_VERSION,
    detectors: [overrides.detector ?? validDetector],
  };
  const files: PackFixture['files'] = [
    { path: 'controls.yaml', value: controls, sha256: 'a'.repeat(64) },
    { path: 'detectors.yaml', value: detectors, sha256: 'b'.repeat(64) },
    {
      path: 'commencement.yaml',
      value: overrides.commencement ?? validCommencement,
      sha256: 'c'.repeat(64),
    },
  ];
  if (overrides.mapping !== undefined) {
    files.push({
      path: 'mappings/inventory.yaml',
      value: overrides.mapping,
      sha256: 'd'.repeat(64),
    });
  }
  const manifest = {
    version: 1,
    pack: DPDPA_PACK_V2_VERSION,
    generatedAt: '2026-11-27T00:00:00.000Z',
    files: files.map((file) => ({
      path: file.path,
      sha256: file.path === overrides.driftPath ? '0'.repeat(64) : file.sha256,
    })),
  };
  return { files, manifest };
}

describe('Phase B pack v2 contracts', () => {
  it('exports the version constants from the package index', () => {
    expect(contracts.DPDPA_PACK_V2_VERSION).toBe('dpdpa-2026.11.0');
    expect(contracts.INVENTORY_V1_VERSION).toBe('inventory-1.0.0');
    expect(DPDPA_PACK_V2_VERSION).toBe('dpdpa-2026.11.0');
    expect(INVENTORY_V1_VERSION).toBe('inventory-1.0.0');
  });

  it('accepts a structurally complete manual control', () => {
    expect(controlV2Schema.safeParse(validControl).success).toBe(true);
  });

  it('rejects draft-style control IDs', () => {
    expect(controlV2Schema.safeParse({ ...validControl, code: 'DP-6-01' }).success).toBe(false);
  });

  it('rejects an evidence-based control with no rules', () => {
    const fixture = packFixture({ control: { ...validControl, evidenceMode: 'violation' } });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('missing_rule');
  });

  it('rejects missing or malformed legal references', () => {
    expect(controlV2Schema.safeParse({ ...validControl, legalRefs: [] }).success).toBe(false);
    expect(controlV2Schema.safeParse({ ...validControl, legalRefs: ['see the act'] }).success).toBe(
      false,
    );
  });

  it('accepts hash/token-shaped signals and rejects source content fields', () => {
    const signal = {
      detector: 'schema_scan',
      kind: 'field',
      path: 'src/models/user.ts',
      line: 42,
      token: 'email_address',
      count: 1,
    };
    expect(inventorySignalSchema.safeParse(signal).success).toBe(true);
    for (const key of ['value', 'snippet', 'context', 'match']) {
      expect(inventorySignalSchema.safeParse({ ...signal, [key]: 'secret' }).success).toBe(false);
    }
  });

  it('accepts a bounded detector definition', () => {
    expect(detectorV2Schema.safeParse(validDetector).success).toBe(true);
    expect(detectorV2Schema.safeParse({ ...validDetector, failureMode: 'PASS' }).success).toBe(
      false,
    );
  });

  it('accepts a boolean attestation and rejects malformed expiry', () => {
    const attestation = {
      orgId: '3f2c1a10-5f0e-4f2a-9f7a-1e5c6b7d8a90',
      repositoryId: '8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d',
      key: 'processor.list.published',
      answer: false,
      note: null,
      attestedBy: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      attestedAt: '2026-11-27T00:00:00.000Z',
      expiresAt: null,
    };
    expect(attestationSchema.safeParse(attestation).success).toBe(true);
    expect(attestationSchema.safeParse({ ...attestation, expiresAt: 'not-a-date' }).success).toBe(
      false,
    );
  });

  it('accepts a valid pack without issues', () => {
    expect(validatePackV2(packFixture())).toEqual([]);
  });

  it('accepts checksum-bearing template documentation without a YAML schema', () => {
    const fixture = packFixture();
    const documentation = {
      path: 'templates/README.md',
      value: '# Placeholders are filled in Phase D.\n',
      sha256: 'e'.repeat(64),
    };
    fixture.files.push(documentation);
    const manifest = fixture.manifest as {
      files: Array<{ path: string; sha256: string }>;
    };
    manifest.files.push({ path: documentation.path, sha256: documentation.sha256 });
    expect(validatePackV2(fixture)).toEqual([]);
  });

  it('reports duplicate control codes', () => {
    const fixture = packFixture();
    const controls = fixture.files[0]!.value as { controls: unknown[] };
    controls.controls.push({ ...validControl, title: 'Duplicate' });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('duplicate_control');
  });

  it('reports orphan detector references', () => {
    const fixture = packFixture({
      control: {
        ...validControl,
        evidenceMode: 'absence',
        absenceRules: [
          {
            id: 'absence.consent',
            detector: 'ghost_detector',
            token: 'consent_gate',
            confidence: 'inferred',
          },
        ],
      },
    });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('orphan_detector');
  });

  it('reports checksum drift', () => {
    expect(
      validatePackV2(packFixture({ driftPath: 'detectors.yaml' })).map((i) => i.code),
    ).toContain('checksum_mismatch');
  });

  it('reports invalid commencement data', () => {
    const fixture = packFixture({
      commencement: {
        ...validCommencement,
        entries: [{ ...validCommencement.entries[0], effectiveFrom: '15-11-2026' }],
      },
    });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('invalid_commencement');
  });

  it('reports source-content fields without echoing their values', () => {
    const fixture = packFixture({
      mapping: {
        version: 1,
        pack: DPDPA_PACK_V2_VERSION,
        mappings: [
          {
            detector: 'schema_scan',
            control: 'DPDPA-8.4-SECRET-01',
            confidence: 'inferred',
            rationale: 'test rationale',
            snippet: 'CANARY_MUST_NOT_BE_ECHOED',
          },
        ],
      },
    });
    const issues = validatePackV2(fixture);
    expect(issues.map((issue) => issue.code)).toContain('source_content_field');
    expect(JSON.stringify(issues)).not.toContain('CANARY_MUST_NOT_BE_ECHOED');
  });

  it('reports missing legal refs without echoing raw control identifiers', () => {
    const fixture = packFixture({
      control: { ...validControl, code: 'CANARY_RAW_CODE', legalRefs: [] },
    });
    const issues = validatePackV2(fixture);
    expect(issues.map((issue) => issue.code)).toContain('missing_legal_ref');
    expect(JSON.stringify(issues)).not.toContain('CANARY_RAW_CODE');
  });

  it('reports an invalid manifest without echoing its contents', () => {
    const issues = validatePackV2({ ...packFixture(), manifest: null });
    expect(issues).toEqual([
      expect.objectContaining({ path: 'manifest.yaml', code: 'invalid_manifest' }),
    ]);
    expect(JSON.stringify(issues)).not.toContain('CANARY_MANIFEST');
  });

  it('reports files that are not declared in the manifest', () => {
    const fixture = packFixture();
    fixture.files.push({ path: 'extra.yaml', value: {}, sha256: 'e'.repeat(64) });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('unknown_file');
  });

  it('reports manifest entries that have no matching file', () => {
    const fixture = packFixture();
    fixture.files = fixture.files.filter((file) => file.path !== 'commencement.yaml');
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('missing_file');
  });

  it('reports invalid detector definitions', () => {
    const fixture = packFixture({ detector: { ...validDetector, id: 'BAD_ID' } });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('invalid_schema');
  });

  it('reports an ISO-shaped but impossible commencement date', () => {
    const fixture = packFixture({
      commencement: {
        ...validCommencement,
        entries: [{ ...validCommencement.entries[0], effectiveFrom: '2026-13-45' }],
      },
    });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('invalid_commencement');
  });

  it('accepts a mapping that references a declared detector', () => {
    const fixture = packFixture({
      mapping: {
        version: 1,
        pack: DPDPA_PACK_V2_VERSION,
        mappings: [
          {
            detector: 'schema_scan',
            control: 'DPDPA-8.4-SECRET-01',
            confidence: 'inferred',
            rationale: 'declared detector',
          },
        ],
      },
    });
    expect(validatePackV2(fixture)).toEqual([]);
  });

  it('reports mapping references to undeclared detectors', () => {
    const fixture = packFixture({
      mapping: {
        version: 1,
        pack: DPDPA_PACK_V2_VERSION,
        mappings: [
          {
            detector: 'ghost_detector',
            control: 'DPDPA-8.4-SECRET-01',
            confidence: 'inferred',
            rationale: 'undeclared detector',
          },
        ],
      },
    });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('orphan_detector');
  });

  it('accepts a checksum-bearing catalogue YAML file', () => {
    const fixture = packFixture();
    const catalogue = {
      path: 'catalogs/remediation.yaml',
      value: {
        version: 1,
        pack: DPDPA_PACK_V2_VERSION,
        entries: [{ key: 'remove-hardcoded-secrets', label: 'Remove hardcoded secrets' }],
      },
      sha256: '1'.repeat(64),
    };
    fixture.files.push(catalogue);
    const manifest = fixture.manifest as { files: Array<{ path: string; sha256: string }> };
    manifest.files.push({ path: catalogue.path, sha256: catalogue.sha256 });
    expect(validatePackV2(fixture)).toEqual([]);
  });

  it('reports file types that are not part of the v2 pack', () => {
    const fixture = packFixture();
    fixture.files.push({ path: 'notes.txt', value: 'text', sha256: '2'.repeat(64) });
    const manifest = fixture.manifest as { files: Array<{ path: string; sha256: string }> };
    manifest.files.push({ path: 'notes.txt', sha256: '2'.repeat(64) });
    expect(validatePackV2(fixture).map((issue) => issue.code)).toContain('unknown_file');
  });

  it('accepts violation and positive rules referencing declared detectors', () => {
    const fixture = packFixture({
      control: {
        ...validControl,
        evidenceMode: 'violation',
        violationRules: [
          {
            id: 'violation.secret',
            detector: 'schema_scan',
            provenance: { search: 'secret' },
            confidence: 'inferred',
          },
        ],
        positiveRules: [
          {
            id: 'positive.consent',
            detector: 'schema_scan',
            token: 'consent_gate',
            confidence: 'inferred',
          },
        ],
      },
    });
    expect(validatePackV2(fixture)).toEqual([]);
  });

  it('skips non-object and null control documents without echoing them', () => {
    const nonObject = packFixture({ control: 'CANARY_RAW_ENTRY' });
    const issues = validatePackV2(nonObject);
    expect(issues.map((issue) => issue.code)).toContain('invalid_schema');
    expect(JSON.stringify(issues)).not.toContain('CANARY_RAW_ENTRY');

    const nullDocument = packFixture();
    nullDocument.files[0]!.value = null;
    expect(validatePackV2(nullDocument).map((issue) => issue.code)).toContain('invalid_schema');
  });

  it('sorts issues deterministically when path and code match', () => {
    const fixture = packFixture({
      control: {
        ...validControl,
        evidenceMode: 'absence',
        absenceRules: [
          { id: 'absence.one', detector: 'ghost_one', token: 'a', confidence: 'inferred' },
          { id: 'absence.two', detector: 'ghost_two', token: 'b', confidence: 'inferred' },
        ],
      },
    });
    const orphanIssues = validatePackV2(fixture).filter(
      (issue) => issue.code === 'orphan_detector',
    );
    expect(orphanIssues).toHaveLength(2);
    expect(orphanIssues[0]!.message.localeCompare(orphanIssues[1]!.message)).toBeLessThanOrEqual(0);
  });
});
