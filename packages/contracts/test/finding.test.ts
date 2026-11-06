import { describe, expect, it } from 'vitest';
import { normalisedFindingSchema } from '../src/finding';

// The rules.md §7.1 example shows hashes truncated with "..." for readability;
// this fixture uses full-length values so the strict schema can parse it.
const SPEC_EXAMPLE = {
  scanner: 'checkov',
  scannerRuleId: 'CKV_AWS_19',
  scannerRuleVersion: '3.2.334',
  scannerSeverity: 'high',
  filePath: 'infra/storage.tf',
  lineStart: 14,
  lineEnd: 28,
  message: 'S3 bucket does not have server-side encryption enabled.',
  evidenceRedacted: 'resource "aws_s3_bucket" "customer_docs" { ... }',
  evidenceHash: `sha256:${'6b1f9c02'.repeat(8)}`,
  fingerprint: `fpt_${'7d3c4e5a'.repeat(8)}`,
  context: {
    resourceType: 'aws_s3_bucket',
    resourceName: 'customer_docs',
    framework: 'terraform',
    language: 'hcl',
  },
};

type FindingCase = { name: string; payload: unknown; valid: boolean };

const findingCases: FindingCase[] = [
  { name: 'the rules.md §7.1 example (full-length hashes)', payload: SPEC_EXAMPLE, valid: true },
  {
    name: 'a minimal finding without optional context',
    payload: {
      ...SPEC_EXAMPLE,
      context: undefined,
    },
    valid: true,
  },
  { name: 'lineStart equal to lineEnd', payload: { ...SPEC_EXAMPLE, lineEnd: 14 }, valid: true },
  {
    name: 'a message of exactly 2,000 characters',
    payload: { ...SPEC_EXAMPLE, message: 'm'.repeat(2000) },
    valid: true,
  },
  {
    name: 'lineEnd before lineStart',
    payload: { ...SPEC_EXAMPLE, lineStart: 28, lineEnd: 14 },
    valid: false,
  },
  { name: 'a zero lineStart', payload: { ...SPEC_EXAMPLE, lineStart: 0 }, valid: false },
  {
    name: 'a message of 2,001 characters',
    payload: { ...SPEC_EXAMPLE, message: 'm'.repeat(2001) },
    valid: false,
  },
  {
    name: 'an evidenceHash without the sha256: prefix',
    payload: { ...SPEC_EXAMPLE, evidenceHash: '6b1f9c02'.repeat(8) },
    valid: false,
  },
  {
    name: 'an evidenceHash with a truncated digest',
    payload: { ...SPEC_EXAMPLE, evidenceHash: `sha256:${'6b1f'.repeat(7)}` },
    valid: false,
  },
  {
    name: 'a fingerprint without the fpt_ prefix',
    payload: { ...SPEC_EXAMPLE, fingerprint: '7d3c4e5a'.repeat(8) },
    valid: false,
  },
  {
    name: 'a fingerprint whose digest is not lowercase hex',
    payload: { ...SPEC_EXAMPLE, fingerprint: `fpt_${'z'.repeat(64)}` },
    valid: false,
  },
  {
    name: 'a fingerprint with a malformed control code suffix',
    payload: { ...SPEC_EXAMPLE, fingerprint: `fpt_${'7d3c4e5a'.repeat(8)}:dpdpa-8.4-enc-01` },
    valid: false,
  },
  {
    name: 'an absolute filePath',
    payload: { ...SPEC_EXAMPLE, filePath: '/etc/passwd' },
    valid: false,
  },
  {
    name: 'a filePath escaping the repository root',
    payload: { ...SPEC_EXAMPLE, filePath: '../secrets.tf' },
    valid: false,
  },
  {
    name: 'a nested filePath escaping the repository root',
    payload: { ...SPEC_EXAMPLE, filePath: 'infra/../../etc/passwd' },
    valid: false,
  },
  {
    name: 'a filePath containing a backslash',
    payload: { ...SPEC_EXAMPLE, filePath: 'infra\\storage.tf' },
    valid: false,
  },
  {
    name: 'an unknown scannerSeverity',
    payload: { ...SPEC_EXAMPLE, scannerSeverity: 'urgent' },
    valid: false,
  },
  { name: 'a missing scanner', payload: { ...SPEC_EXAMPLE, scanner: undefined }, valid: false },
  { name: 'an empty scanner', payload: { ...SPEC_EXAMPLE, scanner: '' }, valid: false },
];

describe('normalisedFindingSchema', () => {
  it('parses the rules.md §7.1 example structurally equal', () => {
    expect(normalisedFindingSchema.parse(SPEC_EXAMPLE)).toEqual(SPEC_EXAMPLE);
  });

  for (const { name, payload, valid } of findingCases) {
    it(`${valid ? 'accepts' : 'rejects'} ${name}`, () => {
      expect(normalisedFindingSchema.safeParse(payload).success).toBe(valid);
    });
  }
});
