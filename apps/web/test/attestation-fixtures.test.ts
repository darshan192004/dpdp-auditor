import { describe, expect, it } from 'vitest';
import { fixtureAttestations } from '../server/utils/fixtures/attestations';

describe('attestation fixtures', () => {
  it('are contract-shaped and never carry source text', () => {
    const rows = fixtureAttestations();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual([
        'id',
        'repositoryId',
        'key',
        'answer',
        'note',
        'attestedBy',
        'attestedAt',
        'expiresAt',
        'updatedAt',
      ]);
      expect(row.note?.includes('CANARY')).toBe(false);
    }
  });
});
