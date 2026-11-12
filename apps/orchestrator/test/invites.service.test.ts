import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { hashInviteToken, InvitesService } from '../src/modules/invites/invites.service.js';
import type { InvitesRepository } from '../src/modules/invites/invites.repository.js';
import type { UsersRepository } from '../src/modules/identity/users.repository.js';
import type { OrganizationsRepository } from '../src/modules/identity/organizations.repository.js';
import type { MembershipsRepository } from '../src/modules/identity/memberships.repository.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-9222-222222222222';
const INVITE_ID = '66666666-6666-4666-8666-666666666666';
const TOKEN = 't'.repeat(43);

const ORG = { id: ORG_ID, name: 'Acme', slug: 'acme' };
const USER = { id: USER_ID, email: 'asha@example.com', deletedAt: null };
const MEMBERSHIP = {
  orgId: ORG_ID,
  userId: USER_ID,
  role: 'viewer',
  status: 'active',
};
const INVITE = {
  id: INVITE_ID,
  orgId: ORG_ID,
  email: 'asha@example.com',
  role: 'viewer',
  tokenHash: hashInviteToken(TOKEN),
  invitedBy: null,
  expiresAt: new Date(Date.now() + 60_000),
  acceptedAt: null,
  createdAt: new Date(),
};

function make() {
  const tx = { marker: 'tx' } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: vi.fn(async (fn: (client: Prisma.TransactionClient) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const invites = {
    create: vi.fn().mockResolvedValue(INVITE),
    findActiveByHash: vi.fn().mockResolvedValue(INVITE),
    listPending: vi.fn().mockResolvedValue([INVITE]),
    deletePendingForEmail: vi.fn().mockResolvedValue(0),
    markAccepted: vi.fn().mockResolvedValue({ ...INVITE, acceptedAt: new Date() }),
    deleteExpired: vi.fn().mockResolvedValue(2),
  };
  const users = {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(USER),
  };
  const organizations = { findById: vi.fn().mockResolvedValue(ORG) };
  const memberships = {
    find: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(MEMBERSHIP),
    updateStatus: vi.fn().mockResolvedValue(MEMBERSHIP),
    updateRole: vi.fn().mockResolvedValue(MEMBERSHIP),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new InvitesService(
    prisma,
    invites as unknown as InvitesRepository,
    users as unknown as UsersRepository,
    organizations as unknown as OrganizationsRepository,
    memberships as unknown as MembershipsRepository,
    audit as unknown as AuditService,
  );
  return { service, tx, invites, users, organizations, memberships, audit };
}

describe('InvitesService.createInvite', () => {
  it('rejects an unknown organisation', async () => {
    const { service, organizations } = make();
    organizations.findById.mockResolvedValue(null);
    await expect(
      service.createInvite({ orgId: ORG_ID, email: 'asha@example.com' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('adds an existing user immediately as an active member', async () => {
    const { service, users, memberships, audit, tx } = make();
    users.findByEmail.mockResolvedValue(USER);

    const result = await service.createInvite({
      orgId: ORG_ID,
      email: 'asha@example.com',
      role: 'auditor',
      invitedBy: USER_ID,
    });

    expect(result).toEqual({ kind: 'member', membership: MEMBERSHIP });
    expect(memberships.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', role: 'auditor' }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'member.invited',
        metadata: expect.objectContaining({ existingUser: true }),
      }),
      tx,
    );
  });

  it('activates an existing pending membership instead of duplicating it', async () => {
    const { service, users, memberships } = make();
    users.findByEmail.mockResolvedValue(USER);
    memberships.find.mockResolvedValue({ ...MEMBERSHIP, status: 'invited' });

    await service.createInvite({ orgId: ORG_ID, email: 'asha@example.com' });

    expect(memberships.updateStatus).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      'active',
      expect.anything(),
    );
    expect(memberships.create).not.toHaveBeenCalled();
  });

  it('creates a hashed 7-day invite for an unknown email', async () => {
    const { service, invites, audit, tx } = make();

    const result = await service.createInvite({ orgId: ORG_ID, email: 'asha@example.com' });

    expect(result.kind).toBe('invite');
    if (result.kind !== 'invite') throw new Error('expected invite');
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const created = invites.create.mock.calls[0]?.[0] as { tokenHash: string; expiresAt: Date };
    expect(created.tokenHash).toBe(hashInviteToken(result.token));
    const ttl = created.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(invites.deletePendingForEmail).toHaveBeenCalledWith(ORG_ID, 'asha@example.com', tx);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ existingUser: false }) }),
      tx,
    );
  });

  it('treats a soft-deleted user as an unknown email', async () => {
    const { service, users, invites } = make();
    users.findByEmail.mockResolvedValue({ ...USER, deletedAt: new Date() });

    const result = await service.createInvite({ orgId: ORG_ID, email: 'asha@example.com' });

    expect(result.kind).toBe('invite');
    expect(invites.create).toHaveBeenCalled();
  });
});

describe('InvitesService.acceptInvite', () => {
  it('rejects invalid and expired tokens', async () => {
    const { service, invites } = make();
    invites.findActiveByHash.mockResolvedValue(null);
    await expect(service.acceptInvite({ token: TOKEN, userId: USER_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    invites.findActiveByHash.mockResolvedValue({
      ...INVITE,
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(service.acceptInvite({ token: TOKEN, userId: USER_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects a missing user and an email mismatch', async () => {
    const { service, users } = make();
    users.findById.mockResolvedValue(null);
    await expect(service.acceptInvite({ token: TOKEN, userId: USER_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    users.findById.mockResolvedValue({ ...USER, email: 'other@example.com' });
    await expect(service.acceptInvite({ token: TOKEN, userId: USER_ID })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('activates an existing membership', async () => {
    const { service, memberships, invites, audit } = make();
    memberships.find.mockResolvedValue({ ...MEMBERSHIP, status: 'invited' });

    await expect(service.acceptInvite({ token: TOKEN, userId: USER_ID })).resolves.toEqual(
      MEMBERSHIP,
    );
    expect(memberships.updateStatus).toHaveBeenCalled();
    expect(memberships.create).not.toHaveBeenCalled();
    expect(invites.markAccepted).toHaveBeenCalledWith(INVITE_ID, expect.anything());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.joined' }),
      expect.anything(),
    );
  });

  it('creates a membership for a first-time member', async () => {
    const { service, memberships } = make();

    await service.acceptInvite({ token: TOKEN, userId: USER_ID });

    expect(memberships.create).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, userId: USER_ID, status: 'active' }),
      expect.anything(),
    );
  });
});

describe('InvitesService helpers', () => {
  it('lists pending invites and cleans up expired ones', async () => {
    const { service, invites } = make();
    await expect(service.listPending(ORG_ID)).resolves.toEqual([INVITE]);
    expect(invites.listPending).toHaveBeenCalledWith(ORG_ID, expect.any(Date));

    await expect(service.cleanupExpired(new Date('2026-11-12T00:00:00.000Z'))).resolves.toBe(2);
    expect(invites.deleteExpired).toHaveBeenCalledWith(new Date('2026-11-12T00:00:00.000Z'));
  });
});
