import { describe, expect, it, vi } from 'vitest';
import { InternalIdentityController } from '../src/modules/identity/internal-identity.controller.js';
import type { IdentityService } from '../src/modules/identity/identity.service.js';
import type { SessionService } from '../src/modules/identity/session.service.js';
import type { FeatureFlagsService } from '../src/modules/feature-flags/feature-flags.service.js';

const USER_ID = '22222222-2222-4222-9222-222222222222';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

const USER = {
  id: USER_ID,
  email: 'asha@example.com',
  name: 'Asha',
  avatarUrl: null,
};

const ME = {
  user: USER,
  memberships: [
    {
      orgId: ORG_ID,
      role: 'owner',
      status: 'active',
      organization: {
        id: ORG_ID,
        name: 'Acme',
        slug: 'acme',
        plan: 'pro',
        retentionDays: 365,
      },
    },
  ],
};

function make() {
  const identity = {
    upsertGithubUser: vi.fn().mockResolvedValue(USER),
    me: vi.fn().mockResolvedValue(ME),
  };
  const sessions = {
    create: vi.fn().mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      activeOrgId: null,
      absoluteExpiresAt: new Date('2026-11-13T18:00:00.000Z'),
    }),
    resolve: vi.fn().mockResolvedValue({
      id: SESSION_ID,
      userId: USER_ID,
      activeOrgId: null,
      absoluteExpiresAt: new Date('2026-11-13T18:00:00.000Z'),
    }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const flags = { all: vi.fn().mockReturnValue({ auditExport: true }) };

  return {
    controller: new InternalIdentityController(
      identity as unknown as IdentityService,
      sessions as unknown as SessionService,
      flags as unknown as FeatureFlagsService,
    ),
    identity,
    sessions,
    flags,
  };
}

describe('InternalIdentityController', () => {
  it('upserts the GitHub profile and returns the user', async () => {
    const { controller, identity } = make();
    const profile = {
      githubUserId: 42,
      email: 'asha@example.com',
      name: 'Asha',
      avatarUrl: null,
    };

    await expect(controller.upsertUser(profile)).resolves.toEqual({ data: USER });
    expect(identity.upsertGithubUser).toHaveBeenCalledWith(profile);
  });

  it('creates and revokes sessions by id', async () => {
    const { controller, sessions } = make();

    await expect(controller.createSession({ userId: USER_ID })).resolves.toEqual({
      data: expect.objectContaining({ id: SESSION_ID }),
    });
    expect(sessions.create).toHaveBeenCalledWith({ userId: USER_ID });

    await expect(controller.revokeSession(SESSION_ID)).resolves.toBeUndefined();
    expect(sessions.revoke).toHaveBeenCalledWith(SESSION_ID);
  });

  it('resolves a session into session, user, memberships, and flags', async () => {
    const { controller, sessions, identity, flags } = make();

    await expect(controller.resolveSession(SESSION_ID)).resolves.toEqual({
      data: {
        session: expect.objectContaining({ id: SESSION_ID }),
        ...ME,
        featureFlags: { auditExport: true },
      },
    });
    expect(sessions.resolve).toHaveBeenCalledWith(SESSION_ID);
    expect(identity.me).toHaveBeenCalledWith(USER_ID);
    expect(flags.all).toHaveBeenCalled();
  });

  it('requires X-User-Id for API-key style /me', async () => {
    const { controller, identity } = make();

    await expect(controller.me(USER_ID)).resolves.toEqual({
      data: { ...ME, featureFlags: { auditExport: true } },
    });
    expect(identity.me).toHaveBeenCalledWith(USER_ID);

    await expect(controller.me(undefined)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
