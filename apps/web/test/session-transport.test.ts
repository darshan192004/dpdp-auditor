import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $fetch } from 'ofetch';
import { fetchResolvedSession } from '../server/utils/session';

const mocks = vi.hoisted(() => ({
  config: {
    url: 'https://orchestrator.internal',
    hmacKey: 'a'.repeat(32),
    internalKey: 'b'.repeat(32),
  },
}));
vi.mock('../server/utils/orchestrator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/utils/orchestrator')>()),
  orchestratorConfig: () => mocks.config,
}));
const event = { context: { requestId: 'req_transport' } } as never;
beforeEach(() => {
  mocks.config.url = 'https://orchestrator.internal';
});
afterEach(() => vi.restoreAllMocks());

describe('session lookup credential transport', () => {
  it.each(['http://orchestrator.internal', 'not-a-url', 'http://localhost.evil.test'])(
    'fails closed without sending credentials to %s',
    async (url) => {
      mocks.config.url = url;
      const raw = vi.spyOn($fetch, 'raw');
      await expect(fetchResolvedSession(event, 'session')).resolves.toBeNull();
      expect(raw).not.toHaveBeenCalled();
    },
  );
  it('refuses redirects when resolving sessions and fails closed on rejection', async () => {
    const raw = vi.spyOn($fetch, 'raw').mockRejectedValue(new TypeError('unexpected redirect'));
    await expect(fetchResolvedSession(event, 'session')).resolves.toBeNull();
    expect(raw).toHaveBeenCalledWith(
      'https://orchestrator.internal/internal/v1/identity/sessions/session',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: expect.objectContaining({ 'x-internal-key': mocks.config.internalKey }),
      }),
    );
  });
});
