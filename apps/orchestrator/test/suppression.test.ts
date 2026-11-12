import { describe, expect, it } from 'vitest';
import type { Suppression } from '../src/modules/rule-pack/rule-pack.schemas.js';
import { globMatches, isLive, isSuppressed } from '../src/modules/scoring/suppression.js';

const NOW = new Date('2026-11-12T00:00:00.000Z');

function suppression(overrides: Partial<Suppression> = {}): Suppression {
  return {
    id: 'fixture-keys',
    paths: ['**/tests/fixtures/**'],
    scanners: ['gitleaks'],
    controls: ['DPDPA-8.4-SECRET-01'],
    matchHashes: ['sha256:abc'],
    reason: 'A reviewed fake fixture key that cannot authenticate.',
    reviewedBy: 'security@example.com',
    expiresAt: '2027-01-01',
    ...overrides,
  };
}

function finding(overrides: Partial<Parameters<typeof isSuppressed>[0]> = {}) {
  return {
    scanner: 'gitleaks',
    controlCode: 'DPDPA-8.4-SECRET-01',
    filePath: 'services/tests/fixtures/key.py',
    evidenceHash: 'sha256:abc',
    ...overrides,
  };
}

describe('globMatches', () => {
  it('matches ** across directories', () => {
    expect(globMatches('**/tests/fixtures/**', 'tests/fixtures/a.json')).toBe(true);
    expect(globMatches('**/tests/fixtures/**', 'services/tests/fixtures/key.py')).toBe(true);
    expect(globMatches('**/tests/fixtures/**', 'services/tests/other/key.py')).toBe(false);
  });

  it('keeps * inside one segment', () => {
    expect(globMatches('*.tf', 'main.tf')).toBe(true);
    expect(globMatches('*.tf', 'infra/main.tf')).toBe(false);
    expect(globMatches('infra/*.tf', 'infra/main.tf')).toBe(true);
  });

  it('normalises Windows separators', () => {
    expect(globMatches('infra/**', 'infra\\modules\\main.tf')).toBe(true);
  });
});

describe('isLive', () => {
  it('is live through the expiry date and dead afterwards', () => {
    expect(isLive(suppression({ expiresAt: '2026-11-12' }), NOW)).toBe(true);
    expect(isLive(suppression({ expiresAt: '2026-11-11' }), NOW)).toBe(false);
  });
});

describe('isSuppressed (P4-19)', () => {
  it('suppresses a secret only with an exact evidence hash', () => {
    expect(isSuppressed(finding(), [suppression()], NOW)).toBe(true);
    expect(isSuppressed(finding({ evidenceHash: 'sha256:other' }), [suppression()], NOW)).toBe(
      false,
    );
    expect(isSuppressed(finding({ evidenceHash: null }), [suppression()], NOW)).toBe(false);
  });

  it('suppresses a non-secret by path without a hash', () => {
    const checkov = suppression({
      scanners: ['checkov'],
      controls: ['DPDPA-8.4-ENC-01'],
      matchHashes: [],
    });
    const candidate = finding({
      scanner: 'checkov',
      controlCode: 'DPDPA-8.4-ENC-01',
      evidenceHash: null,
    });

    expect(isSuppressed(candidate, [checkov], NOW)).toBe(true);
  });

  it('requires the scanner, control, and path to match', () => {
    expect(isSuppressed(finding({ scanner: 'semgrep' }), [suppression()], NOW)).toBe(false);
    expect(isSuppressed(finding({ controlCode: 'DPDPA-6-CONSENT-01' }), [suppression()], NOW)).toBe(
      false,
    );
    expect(isSuppressed(finding({ filePath: 'src/app.py' }), [suppression()], NOW)).toBe(false);
    expect(isSuppressed(finding({ filePath: null }), [suppression()], NOW)).toBe(false);
    expect(isSuppressed(finding({ controlCode: null }), [suppression()], NOW)).toBe(false);
  });

  it('ignores an expired suppression', () => {
    expect(isSuppressed(finding(), [suppression({ expiresAt: '2026-01-01' })], NOW)).toBe(false);
  });
});
