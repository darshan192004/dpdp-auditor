import { fileURLToPath } from 'node:url';
import { $fetch, setup } from '@nuxt/test-utils/e2e';
import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';

// Builds the app and boots a real Nitro server, then proves the global error
// handler puts every non-2xx response in the docs/api.md §1.4 envelope.
await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  server: true,
  build: true,
});

describe('global Nitro error handler', () => {
  it('returns the contract envelope for an unknown API route', async () => {
    try {
      await $fetch('/api/definitely-not-a-route');
      throw new Error('expected a 404');
    } catch (error) {
      const err = error as { statusCode?: number; data?: unknown };
      expect(err.statusCode).toBe(404);
      const envelope = errorEnvelopeSchema.parse(err.data);
      expect(envelope.error.code).toBe('NOT_FOUND');
      expect(envelope.error.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(JSON.stringify(envelope)).not.toContain('at ');
    }
  });

  it('echoes a valid incoming X-Request-Id on the error response', async () => {
    const requestId = 'req_client_supplied_01';
    try {
      await $fetch('/api/definitely-not-a-route', { headers: { 'x-request-id': requestId } });
      throw new Error('expected a 404');
    } catch (error) {
      const err = error as { statusCode?: number; data?: unknown };
      expect(err.statusCode).toBe(404);
      const envelope = errorEnvelopeSchema.parse(err.data);
      expect(envelope.error.requestId).toBe(requestId);
    }
  });
});
