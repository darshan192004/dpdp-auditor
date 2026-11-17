import { describe, expect, it, vi } from 'vitest';
import { InternalIdentityController } from '../src/modules/identity/internal-identity.controller.js';
import type { IdentityService } from '../src/modules/identity/identity.service.js';
import type { SessionService } from '../src/modules/identity/session.service.js';
import type { FeatureFlagsService } from '../src/modules/feature-flags/feature-flags.service.js';

const USER_ID = '22222222-2222-4222-9222-222222222222';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-a333-333333333333';

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
    createOrganizationForUser: vi.fn().mockResolvedValue({ id: ORG_ID, role: 'owner' }),
    getOrganization: vi.fn().mockResolvedValue({ id: ORG_ID, role: 'owner' }),
    updateOrganization: vi.fn().mockResolvedValue({ id: ORG_ID, role: 'owner' }),
    listMemberViews: vi.fn().mockResolvedValue([]),
    addMemberByEmail: vi.fn().mockResolvedValue({ userId: USER_ID, role: 'viewer' }),
    changeRole: vi.fn().mockResolvedValue({ orgId: ORG_ID, userId: USER_ID, role: 'admin' }),
    removeMember: vi.fn().mockResolvedValue(undefined),
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

  it('creates an organisation for the header user', async () => {
    const { controller, identity } = make();

    await expect(
      controller.createOrganization(USER_ID, { name: 'Acme', slug: 'acme' }),
    ).resolves.toEqual({ data: { id: ORG_ID, role: 'owner' } });
    expect(identity.createOrganizationForUser).toHaveBeenCalledWith(USER_ID, {
      name: 'Acme',
      slug: 'acme',
    });

    await expect(
      controller.createOrganization(undefined, { name: 'Acme', slug: 'acme' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reads and updates the organisation using both headers', async () => {
    const { controller, identity } = make();

    await expect(controller.getOrganization(ORG_ID, USER_ID)).resolves.toEqual({
      data: { id: ORG_ID, role: 'owner' },
    });
    expect(identity.getOrganization).toHaveBeenCalledWith(ORG_ID, USER_ID);

    await expect(
      controller.updateOrganization(ORG_ID, USER_ID, { name: 'Acme Payments' }),
    ).resolves.toEqual({ data: { id: ORG_ID, role: 'owner' } });
    expect(identity.updateOrganization).toHaveBeenCalledWith(ORG_ID, USER_ID, {
      name: 'Acme Payments',
    });

    await expect(controller.getOrganization(undefined, USER_ID)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(controller.getOrganization(ORG_ID, undefined)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('lists and adds members through the internal API', async () => {
    const { controller, identity } = make();

    await expect(controller.listMembers(ORG_ID, USER_ID)).resolves.toEqual({ data: [] });
    expect(identity.listMemberViews).toHaveBeenCalledWith(ORG_ID, USER_ID);

    await expect(
      controller.addMember(ORG_ID, USER_ID, { email: 'dev@example.com', role: 'viewer' }),
    ).resolves.toEqual({ data: { userId: USER_ID, role: 'viewer' } });
    expect(identity.addMemberByEmail).toHaveBeenCalledWith(ORG_ID, USER_ID, {
      email: 'dev@example.com',
      role: 'viewer',
    });
  });

  it('changes and removes a member, passing the actor through', async () => {
    const { controller, identity } = make();

    await expect(
      controller.changeMemberRole(ORG_ID, USER_ID, OTHER_ID, { role: 'admin' }),
    ).resolves.toEqual({
      data: { orgId: ORG_ID, userId: USER_ID, role: 'admin' },
    });
    expect(identity.changeRole).toHaveBeenCalledWith(
      { orgId: ORG_ID, userId: OTHER_ID, role: 'admin' },
      USER_ID,
    );

    await expect(controller.removeMember(ORG_ID, USER_ID, OTHER_ID)).resolves.toBeUndefined();
    expect(identity.removeMember).toHaveBeenCalledWith(ORG_ID, OTHER_ID, USER_ID);
  });
});
