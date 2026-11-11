import { describe, expect, it } from 'vitest';
import { scrubPosthogProperties } from '../plugins/posthog.client';
import { scrubSentryEvent } from '../plugins/sentry.client';

describe('scrubSentryEvent (P1-32 PII scrubbing)', () => {
  it('drops PII-shaped keys at any depth', () => {
    const event = {
      message: 'boom',
      user: { id: 'u_1', email: 'a@b.com' },
      request: { headers: { cookie: 'sid=1', 'x-request-id': 'r1' } },
      extra: { password: 'hunter2', attempts: 3 },
    };
    const scrubbed = scrubSentryEvent(event) as typeof event;

    expect(scrubbed.message).toBe('boom');
    expect(scrubbed.user).toEqual({ id: 'u_1' });
    expect(scrubbed.request.headers).toEqual({ 'x-request-id': 'r1' });
    expect(scrubbed.extra).toEqual({ attempts: 3 });
  });

  it('redacts email-looking strings inside values', () => {
    const scrubbed = scrubSentryEvent({
      message: 'failed for user darshan@example.com at 10:00',
    }) as { message: string };
    expect(scrubbed.message).toBe('failed for user [redacted-email] at 10:00');
  });

  it('leaves arrays and primitives intact', () => {
    expect(scrubSentryEvent({ tags: ['ok', 'keep'], count: 2 })).toEqual({
      tags: ['ok', 'keep'],
      count: 2,
    });
  });
});

describe('scrubPosthogProperties (P1-32 PII scrubbing)', () => {
  it('removes identity and secret properties', () => {
    const scrubbed = scrubPosthogProperties({
      $current_url: 'https://app.example/app/scans',
      email: 'a@b.com',
      $ip: '1.2.3.4',
      session: 'abc',
      plan: 'pro',
    });
    expect(scrubbed).toEqual({
      $current_url: 'https://app.example/app/scans',
      plan: 'pro',
    });
  });
});
