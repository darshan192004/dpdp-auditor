import { describe, expect, it } from 'vitest';
import { resolveActiveMembership, toMePayload, toOrgContext } from '../shared/auth';

const ACME = { id: 'org-1', name: 'Acme', slug: 'acme', plan: 'pro', retentionDays: 365 };
const BETA = { id: 'org-2', name: 'Beta', slug: 'beta', plan: 'free', retentionDays: 90 };

const MEMBERSHIPS = [
  { orgId: 'org-1', role: 'owner', organization: ACME },
  { orgId: 'org-2', role: 'viewer', organization: BETA },
];

describe('shared/auth', () => {
  it('prefers the session active org and falls back to the first membership', () => {
    expect(resolveActiveMembership({ memberships: MEMBERSHIPS, activeOrgId: 'org-2' })).toBe(
      MEMBERSHIPS[1],
    );
    expect(resolveActiveMembership({ memberships: MEMBERSHIPS, activeOrgId: null })).toBe(
      MEMBERSHIPS[0],
    );
    expect(resolveActiveMembership({ memberships: [], activeOrgId: 'org-1' })).toBeNull();
  });

  it('builds the org context with the user role attached', () => {
    expect(toOrgContext({ memberships: MEMBERSHIPS, activeOrgId: 'org-2' })).toEqual({
      ...BETA,
      role: 'viewer',
    });
    expect(toOrgContext({ memberships: [], activeOrgId: null })).toBeNull();
  });

  it('derives activeOrgId and role for /api/v1/me', () => {
    const payload = toMePayload({
      session: { activeOrgId: null },
      user: { id: 'user-1', name: 'Asha', email: 'asha@example.com', avatarUrl: null },
      memberships: MEMBERSHIPS,
      featureFlags: { auditExport: true },
    });

    expect(payload.activeOrgId).toBe('org-1');
    expect(payload.role).toBe('owner');
    expect(payload.user.email).toBe('asha@example.com');
  });

  it('reports no active org for a user with no memberships', () => {
    const payload = toMePayload({
      session: { activeOrgId: 'org-1' },
      user: { id: 'user-1', name: null, email: 'asha@example.com', avatarUrl: null },
      memberships: [],
      featureFlags: {},
    });

    expect(payload.activeOrgId).toBeNull();
    expect(payload.role).toBeNull();
  });
});
