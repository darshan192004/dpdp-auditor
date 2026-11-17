import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SessionService,
} from '../src/modules/identity/session.service.js';
import type { SessionsRepository } from '../src/modules/identity/sessions.repository.js';
import type { UsersRepository } from '../src/modules/identity/users.repository.js';

const USER_ID = '22222222-2222-4222-9222-222222222222';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-13T10:00:00.000Z');

function makeService() {
  const sessions = {
    create: vi.fn(),
    findById: vi.fn(),
    touch: vi.fn().mockResolvedValue(undefined),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const users = { findById: vi.fn() };
  const service = new SessionService(
    sessions as unknown as SessionsRepository,
    users as unknown as UsersRepository,
  );
  return { service, sessions, users };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    activeOrgId: null,
    ip: null,
    userAgent: null,
    createdAt: NOW,
    lastSeenAt: NOW,
    absoluteExpiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_MS),
    revokedAt: null,
    ...overrides,
  };
}

describe('SessionService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('stamps the 8-hour absolute expiry from the server clock', async () => {
      const { service, sessions, users } = makeService();
      users.findById.mockResolvedValue({ id: USER_ID, deletedAt: null });
      sessions.create.mockImplementation(async (input: { absoluteExpiresAt: Date }) => ({
        ...session(),
        absoluteExpiresAt: input.absoluteExpiresAt,
      }));

      const view = await service.create({ userId: USER_ID });

      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          absoluteExpiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_MS),
        }),
      );
      expect(view).toEqual({
        id: SESSION_ID,
        userId: USER_ID,
        activeOrgId: null,
        absoluteExpiresAt: new Date(NOW.getTime() + SESSION_ABSOLUTE_MS),
      });
    });

    it('refuses to mint a session for a missing or deleted user', async () => {
      const { service, users } = makeService();
      users.findById.mockResolvedValue(null);
      await expect(service.create({ userId: USER_ID })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      users.findById.mockResolvedValue({ id: USER_ID, deletedAt: new Date() });
      await expect(service.create({ userId: USER_ID })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('resolve', () => {
    it('refreshes lastSeenAt and returns the session', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValue(session());

      await expect(service.resolve(SESSION_ID)).resolves.toMatchObject({
        id: SESSION_ID,
        userId: USER_ID,
      });
      expect(sessions.touch).toHaveBeenCalledWith(SESSION_ID, NOW);
    });

    it('rejects a session idle for longer than 30 minutes and revokes it', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValue(
        session({ lastSeenAt: new Date(NOW.getTime() - SESSION_IDLE_MS - 1) }),
      );

      await expect(service.resolve(SESSION_ID)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      expect(sessions.revoke).toHaveBeenCalledWith(SESSION_ID, NOW);
      expect(sessions.touch).not.toHaveBeenCalled();
    });

    it('rejects an absolutely expired session', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValue(
        session({ absoluteExpiresAt: new Date(NOW.getTime() - 1) }),
      );

      await expect(service.resolve(SESSION_ID)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('rejects a revoked session without re-revoking it', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValue(session({ revokedAt: NOW }));

      await expect(service.resolve(SESSION_ID)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      expect(sessions.revoke).not.toHaveBeenCalled();
    });

    it('rejects an unknown session id', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValue(null);

      await expect(service.resolve(SESSION_ID)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      expect(sessions.revoke).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('is idempotent for missing and already-revoked sessions', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValueOnce(null);
      await service.revoke(SESSION_ID);
      expect(sessions.revoke).not.toHaveBeenCalled();

      sessions.findById.mockResolvedValueOnce(session({ revokedAt: NOW }));
      await service.revoke(SESSION_ID);
      expect(sessions.revoke).not.toHaveBeenCalled();
    });

    it('stamps revokedAt once', async () => {
      const { service, sessions } = makeService();
      sessions.findById.mockResolvedValue(session());

      await service.revoke(SESSION_ID);

      expect(sessions.revoke).toHaveBeenCalledWith(SESSION_ID, NOW);
    });
  });

  describe('rotate', () => {
    it('revokes the old session and mints a new one for the same user', async () => {
      const { service, sessions, users } = makeService();
      sessions.findById.mockResolvedValue(session({ activeOrgId: 'org-old' }));
      users.findById.mockResolvedValue({ id: USER_ID, deletedAt: null });
      sessions.create.mockResolvedValue(session({ id: 'new-session' }));

      const view = await service.rotate(SESSION_ID, '55555555-5555-4555-8555-555555555555');

      expect(sessions.revoke).toHaveBeenCalledWith(SESSION_ID, NOW);
      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          activeOrgId: '55555555-5555-4555-8555-555555555555',
        }),
      );
      expect(view.id).toBe('new-session');
    });
  });
});
