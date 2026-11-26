import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(() => 'sealed-cookie'),
  getUserSession: vi.fn(async () => ({
    sessionId: 'sess_1',
    user: { id: 'usr_1', mustChangePassword: false },
  })),
  clearUserSession: vi.fn(async () => undefined),
  fetchResolvedSession: vi.fn(async () => ({
    session: {
      id: 'sess_1',
      userId: 'usr_1',
      activeOrgId: null,
      absoluteExpiresAt: '2026-11-27T00:00:00.000Z',
    },
    user: {
      id: 'usr_1',
      email: 'pilot-admin@improwised.dev',
      name: 'Pilot Admin',
      avatarUrl: null,
    },
    memberships: [{ orgId: 'org_1', role: 'owner', status: 'active' }],
    featureFlags: {},
  })),
}));

vi.mock('../server/utils/fixtures/guard', () => ({ fixturesEnabled: () => false }));
vi.mock('../server/utils/session', () => ({
  SESSION_COOKIE_NAME: 'dpdpa_session',
  fetchResolvedSession: mocks.fetchResolvedSession,
  sessionIdentity: () => ({ userId: 'usr_1', orgId: 'org_1' }),
}));

let handler: (event: unknown) => Promise<void>;

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn);
  vi.stubGlobal('getCookie', mocks.getCookie);
  vi.stubGlobal('getUserSession', mocks.getUserSession);
  vi.stubGlobal('clearUserSession', mocks.clearUserSession);
  vi.stubGlobal(
    'createError',
    (options: { statusMessage: string }) => new Error(options.statusMessage),
  );
  ({ default: handler } = await import('../server/middleware/session'));
});

describe('session middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a valid sealed cookie and resolves the session', async () => {
    const event = { path: '/api/v1/me', context: {} as Record<string, unknown> };

    await handler(event);

    expect(mocks.fetchResolvedSession).toHaveBeenCalledWith(event, 'sess_1');
    expect(mocks.clearUserSession).not.toHaveBeenCalled();
    expect((event.context as { session?: unknown }).session).toBeDefined();
  });
});
