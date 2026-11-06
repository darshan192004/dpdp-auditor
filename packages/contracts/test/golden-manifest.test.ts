import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { goldenManifestSchema } from '../src/golden-manifest';

const GOLDEN_REPOS_DIR = resolve(__dirname, '../../../tests/golden-repos');

const fixtureDirs = existsSync(GOLDEN_REPOS_DIR)
  ? readdirSync(GOLDEN_REPOS_DIR).filter((entry) =>
      statSync(join(GOLDEN_REPOS_DIR, entry)).isDirectory(),
    )
  : [];

const FULL_MANIFEST = {
  name: 'sample',
  languages: ['terraform'],
  scanners: ['checkov'],
  expectedFindings: [
    {
      scanner: 'checkov',
      ruleId: 'CKV_AWS_19',
      control: 'DPDPA-8.4-ENC-01',
      confidence: 'direct',
      severity: 'high',
      minCount: 1,
      maxCount: 1,
    },
  ],
  expectedCoverage: 'full',
  tolerances: { extraFindings: 0 },
};

const finding = FULL_MANIFEST.expectedFindings[0];
if (!finding) throw new Error('sample finding missing');

type ManifestCase = { name: string; payload: unknown; valid: boolean };

const manifestCases: ManifestCase[] = [
  { name: 'a complete manifest', payload: FULL_MANIFEST, valid: true },
  {
    name: 'an unmapped finding without a control code (unmapped-rule fixture)',
    payload: { ...FULL_MANIFEST, expectedFindings: [{ ...finding, control: undefined }] },
    valid: true,
  },
  {
    name: 'optional expectedSectionScores when the pack lands',
    payload: { ...FULL_MANIFEST, expectedSectionScores: { '8(4)': 50 } },
    valid: true,
  },
  {
    name: 'maxCount below minCount',
    payload: {
      ...FULL_MANIFEST,
      expectedFindings: [{ ...finding, minCount: 2, maxCount: 1 }],
    },
    valid: false,
  },
  {
    name: 'a confidence label outside direct/inferred/advisory',
    payload: {
      ...FULL_MANIFEST,
      expectedFindings: [{ ...finding, confidence: 'certain' }],
    },
    valid: false,
  },
  {
    name: 'a severity outside info/low/medium/high/critical',
    payload: {
      ...FULL_MANIFEST,
      expectedFindings: [{ ...finding, severity: 'urgent' }],
    },
    valid: false,
  },
  {
    name: 'a malformed control code',
    payload: {
      ...FULL_MANIFEST,
      expectedFindings: [{ ...finding, control: 'DPDPA-8.4' }],
    },
    valid: false,
  },
  {
    name: 'coverage that is neither full nor partial',
    payload: { ...FULL_MANIFEST, expectedCoverage: 'none' },
    valid: false,
  },
  {
    name: 'a negative extraFindings tolerance',
    payload: { ...FULL_MANIFEST, tolerances: { extraFindings: -1 } },
    valid: false,
  },
  { name: 'an empty languages list', payload: { ...FULL_MANIFEST, languages: [] }, valid: false },
  {
    name: 'missing tolerances',
    payload: { ...FULL_MANIFEST, tolerances: undefined },
    valid: false,
  },
];

describe('goldenManifestSchema', () => {
  for (const { name, payload, valid } of manifestCases) {
    it(`${valid ? 'accepts' : 'rejects'} ${name}`, () => {
      expect(goldenManifestSchema.safeParse(payload).success).toBe(valid);
    });
  }
});

describe('tests/golden-repos fixtures', () => {
  it('has at least 12 fixture directories (P0 acceptance 5)', () => {
    expect(fixtureDirs.length).toBeGreaterThanOrEqual(12);
  });

  for (const dir of fixtureDirs) {
    it(`${dir}/manifest.yaml parses and matches its directory name`, () => {
      const raw = readFileSync(join(GOLDEN_REPOS_DIR, dir, 'manifest.yaml'), 'utf8');
      const parsed = goldenManifestSchema.parse(parse(raw));
      expect(parsed.name).toBe(dir);
    });
  }
});
