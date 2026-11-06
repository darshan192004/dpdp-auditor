import { describe, expect, it } from 'vitest';
import { ID_PREFIXES, idSchema } from '../src/ids';

describe('ID_PREFIXES', () => {
  it('lists the eight public ID prefixes from api.md §1.1', () => {
    expect([...ID_PREFIXES]).toEqual(['org', 'usr', 'repo', 'scn', 'fnd', 'rpt', 'key', 'req']);
  });
});

describe('idSchema', () => {
  it('accepts a ULID-shaped org ID', () => {
    expect(idSchema('org').safeParse('org_01J8Z4A1B2C3D4E5F6G7H8J9K0').success).toBe(true);
  });

  it('parses to the template literal type', () => {
    const parsed: `req_${string}` = idSchema('req').parse('req_01J8Z3K4M5N6P7Q8R9S0T1U2V3');
    expect(parsed).toBe('req_01J8Z3K4M5N6P7Q8R9S0T1U2V3');
  });

  it('rejects an empty suffix', () => {
    expect(idSchema('org').safeParse('org_').success).toBe(false);
  });

  it('rejects a wrong-case prefix', () => {
    expect(idSchema('org').safeParse('ORG_01J8Z4A1B2C3D4E5F6G7H8J9K0').success).toBe(false);
  });

  it('rejects the wrong prefix for the schema', () => {
    expect(idSchema('org').safeParse('usr_01J8Z4A1B2C3D4E5F6G7H8J9K0').success).toBe(false);
  });

  it('rejects an unprefixed ID', () => {
    expect(idSchema('org').safeParse('plain_id').success).toBe(false);
  });

  it('rejects separators inside the suffix', () => {
    expect(idSchema('org').safeParse('org_abc-def').success).toBe(false);
  });

  it('works for every declared prefix', () => {
    for (const prefix of ID_PREFIXES) {
      expect(idSchema(prefix).safeParse(`${prefix}_01J8Z4A1B2C3D4E5F6G7H8J9K0`).success).toBe(true);
    }
  });
});
