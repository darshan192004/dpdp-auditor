import { describe, expect, it } from 'vitest';

import {
  canManageOrg,
  MEMBER_ROLES,
  OrgInputError,
  parseAddMember,
  parseCreateOrg,
  parseOrgPatch,
  parseRoleChange,
  RETENTION_MAX,
  RETENTION_MIN,
  SLUG_PATTERN,
  slugify,
} from '../shared/org';

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(OrgInputError);
    return (error as OrgInputError).message;
  }
  throw new Error('expected the parser to reject');
}

describe('slugify', () => {
  it('turns a display name into a workspace slug', () => {
    expect(slugify('Acme Payments')).toBe('acme-payments');
    expect(slugify('  Foo  &  Bar  ')).toBe('foo-bar');
  });

  it('trims leading/trailing hyphens and caps the length', () => {
    expect(slugify('--Acme--')).toBe('acme');
    const long = slugify('a'.repeat(60));
    expect(long).toHaveLength(40);
    expect(long.endsWith('-')).toBe(false);
  });

  it('produces candidates the slug rule accepts for normal names', () => {
    expect(SLUG_PATTERN.test(slugify('Acme Payments'))).toBe(true);
  });
});

describe('canManageOrg', () => {
  it('allows only owners and admins to change settings', () => {
    expect(canManageOrg('owner')).toBe(true);
    expect(canManageOrg('admin')).toBe(true);
    expect(canManageOrg('auditor')).toBe(false);
    expect(canManageOrg('viewer')).toBe(false);
    expect(canManageOrg(null)).toBe(false);
    expect(canManageOrg(undefined)).toBe(false);
  });
});

describe('parseCreateOrg', () => {
  it('trims the name and keeps a valid slug', () => {
    expect(parseCreateOrg({ name: '  Acme Payments  ', slug: 'acme-payments' })).toEqual({
      name: 'Acme Payments',
      slug: 'acme-payments',
    });
  });

  it('rejects a short name and an invalid slug', () => {
    expect(messageOf(() => parseCreateOrg({ name: 'A', slug: 'acme' }))).toContain('between 2 and');
    expect(messageOf(() => parseCreateOrg({ name: 'Acme', slug: 'Acme' }))).toContain('3–40');
  });

  it('rejects a non-object body', () => {
    expect(messageOf(() => parseCreateOrg(null))).toContain('JSON object');
  });
});

describe('parseOrgPatch', () => {
  it('accepts the editable settings subset', () => {
    expect(parseOrgPatch({ name: ' Acme ', retentionDays: 30 })).toEqual({
      name: 'Acme',
      retentionDays: 30,
    });
    expect(parseOrgPatch({ settings: { notifications: false } })).toEqual({
      settings: { notifications: false },
    });
  });

  it('keeps retention inside the database range', () => {
    expect(messageOf(() => parseOrgPatch({ retentionDays: RETENTION_MIN - 1 }))).toContain(
      'whole number',
    );
    expect(messageOf(() => parseOrgPatch({ retentionDays: RETENTION_MAX + 1 }))).toContain(
      'whole number',
    );
    expect(messageOf(() => parseOrgPatch({ retentionDays: 12.5 }))).toContain('whole number');
  });

  it('rejects an empty patch and a non-boolean notification flag', () => {
    expect(messageOf(() => parseOrgPatch({}))).toContain('at least one');
    expect(messageOf(() => parseOrgPatch({ settings: { notifications: 'yes' } }))).toContain(
      'true or false',
    );
  });
});

describe('parseAddMember', () => {
  it('defaults the role to viewer', () => {
    expect(parseAddMember({ email: 'priya@acme.example' })).toEqual({
      email: 'priya@acme.example',
      role: 'viewer',
    });
  });

  it('accepts every role in the contract', () => {
    for (const role of MEMBER_ROLES) {
      expect(parseAddMember({ email: 'priya@acme.example', role }).role).toBe(role);
    }
  });

  it('rejects a malformed email and an unknown role', () => {
    expect(messageOf(() => parseAddMember({ email: 'not-an-email' }))).toContain('valid email');
    expect(messageOf(() => parseAddMember({ email: 'a@b.co', role: 'superuser' }))).toContain(
      'Unknown member role',
    );
  });
});

describe('parseRoleChange', () => {
  it('accepts a known role and rejects anything else', () => {
    expect(parseRoleChange({ role: 'admin' })).toBe('admin');
    expect(messageOf(() => parseRoleChange({ role: 'root' }))).toContain('Unknown member role');
  });
});
