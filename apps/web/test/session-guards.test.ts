import { describe, expect, it } from 'vitest';

import {
  requireIdentity,
  requireRole,
  requireSession,
  sessionIdentity,
  type ResolvedSession,
} from '../server/utils/session';

const USER = {
  id: 'usr_1',
  name: 'Priya Nair',
  email: 'priya@acme.example',
  avatarUrl: null,
};

const ORGANIZATION = {
  id: 'org_1',
  name: 'Acme Payments',
  slug: 'acme-payments',
  plan: 'growth',
  retentionDays: 365,
};

function resolved(overrides: Partial<ResolvedSession> = {}): ResolvedSession {
  return {
    session: {
      id: 'ses_1',
      userId: 'usr_1',
      activeOrgId: null,
      absoluteExpiresAt: '2026-11-14T12:00:00.000Z',
    },
    user: USER,
    memberships: [
      { orgId: 'org_1', role: 'auditor', status: 'active', organization: ORGANIZATION },
    ],
    featureFlags: {},
    ...overrides,
  };
}

function eventWith(session?: ResolvedSession): { context: { session?: ResolvedSession } } {
  return { context: session === undefined ? {} : { session } };
}

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the guard to reject');
}

describe('sessionIdentity', () => {
  it('prefers the explicitly selected org', () => {
    const identity = sessionIdentity({
      session: { ...resolved().session, activeOrgId: 'org_2' },
      memberships: [
        { orgId: 'org_1', role: 'owner', status: 'active', organization: ORGANIZATION },
        { orgId: 'org_2', role: 'viewer', status: 'active', organization: ORGANIZATION },
      ],
    });
    expect(identity.orgId).toBe('org_2');
  });

  it('falls back to the first membership and then to null', () => {
    expect(sessionIdentity(resolved()).orgId).toBe('org_1');
    expect(sessionIdentity({ session: resolved().session, memberships: [] }).orgId).toBeNull();
  });
});

describe('requireSession', () => {
  it('answers 401 UNAUTHENTICATED without a resolved session', () => {
    expect(caught(() => requireSession(eventWith() as never))).toMatchObject({
      statusCode: 401,
      data: { error: { code: 'UNAUTHENTICATED' } },
    });
  });

  it('returns the user id for a signed-in session', () => {
    expect(requireSession(eventWith(resolved()) as never).userId).toBe('usr_1');
  });
});

describe('requireIdentity', () => {
  it('answers 403 when the session has no organisation', () => {
    expect(
      caught(() => requireIdentity(eventWith(resolved({ memberships: [] })) as never)),
    ).toMatchObject({ statusCode: 403, data: { error: { code: 'FORBIDDEN' } } });
  });

  it('answers 403 for a suspended membership', () => {
    const session = resolved({
      memberships: [
        { orgId: 'org_1', role: 'auditor', status: 'suspended', organization: ORGANIZATION },
      ],
    });
    expect(caught(() => requireIdentity(eventWith(session) as never))).toMatchObject({
      statusCode: 403,
      data: { error: { code: 'FORBIDDEN' } },
    });
  });

  it('returns the active org and role', () => {
    expect(requireIdentity(eventWith(resolved()) as never)).toMatchObject({
      userId: 'usr_1',
      orgId: 'org_1',
      role: 'auditor',
    });
  });
});

describe('requireRole', () => {
  it('allows a listed role and rejects the rest', () => {
    expect(requireRole(eventWith(resolved()) as never, ['owner', 'admin', 'auditor']).role).toBe(
      'auditor',
    );

    expect(
      caught(() => requireRole(eventWith(resolved()) as never, ['owner', 'admin'])),
    ).toMatchObject({
      statusCode: 403,
      data: { error: { code: 'FORBIDDEN' } },
    });
  });
});
