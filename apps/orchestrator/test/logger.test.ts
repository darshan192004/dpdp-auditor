import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import {
  attachRequestContext,
  createLogger,
  PinoLoggerService,
  requestLogFields,
} from '../src/common/logger.js';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, stream };
}

describe('createLogger redaction', () => {
  it('redacts sensitive keys anywhere and preserves the correlation trio', () => {
    const { lines, stream } = capture();
    const log = createLogger(stream);
    log.info(
      {
        requestId: 'req_abcdef123456',
        orgId: 'org_ok123',
        scanId: 'scn_ok123',
        password: 'hunter2',
        token: 'tok_1',
        authorization: 'Bearer x',
        cookie: 'sid=1',
        email: 'person@example.com',
        apiKey: 'k-1',
        nested: { api_key: 'k-2', deep: { secret: 's-1' }, keep: 'v' },
      },
      'event',
    );
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatchObject({
      msg: 'event',
      requestId: 'req_abcdef123456',
      orgId: 'org_ok123',
      scanId: 'scn_ok123',
      nested: { keep: 'v' },
    });
    for (const key of ['password', 'token', 'authorization', 'cookie', 'email', 'apiKey']) {
      expect(line[key]).toBe('[REDACTED]');
    }
    const nested = line.nested as Record<string, unknown>;
    expect(nested.api_key).toBe('[REDACTED]');
    expect((nested.deep as Record<string, unknown>).secret).toBe('[REDACTED]');
  });

  it('keeps error stacks while redacting sibling secrets', () => {
    const { lines, stream } = capture();
    const log = createLogger(stream);
    log.error({ err: new Error('boom at /srv/app/index.js:10'), token: 'tok_1' }, 'failed');
    const line = lines[0]!;
    const err = line.err as Record<string, unknown>;
    expect(String(err.stack)).toContain('boom');
    expect(line.token).toBe('[REDACTED]');
  });

  it('serializes a bare Error argument without losing the stack', () => {
    const { lines, stream } = capture();
    const log = createLogger(stream);
    log.error(new Error('kaboom'));
    const line = lines[0]!;
    const err = line.err as Record<string, unknown>;
    expect(err.message).toBe('kaboom');
    expect(String(err.stack)).toContain('kaboom');
  });
});

describe('PinoLoggerService', () => {
  it('writes JSON lines with context, trace, and levels', () => {
    const { lines, stream } = capture();
    const service = new PinoLoggerService(createLogger(stream) as Logger);
    service.log('started', 'Bootstrap');
    service.error('failed', 'stack here', 'Thing');
    service.warn('careful', 'Thing');
    service.debug('detail', 'Thing');
    service.verbose('finer', 'Thing');
    service.flush();
    expect(lines[0]).toMatchObject({ level: 30, msg: 'started', context: 'Bootstrap' });
    expect(lines[1]).toMatchObject({
      level: 50,
      msg: 'failed',
      context: 'Thing',
      trace: 'stack here',
    });
    expect(lines[2]).toMatchObject({ level: 40, msg: 'careful', context: 'Thing' });
    // debug/verbose are dropped at the default info level (observability.md).
    expect(lines).toHaveLength(3);
  });
});

function fakeRequest(
  overrides: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    url?: string;
    method?: string;
  } = {},
): FastifyRequest {
  return {
    headers: overrides.headers ?? {},
    params: overrides.params ?? {},
    routeOptions: overrides.url ? { url: overrides.url } : {},
    method: overrides.method ?? 'GET',
  } as unknown as FastifyRequest;
}

describe('request context and log fields', () => {
  it('binds a valid x-request-id and logs the schema fields', () => {
    const request = fakeRequest({
      headers: { 'x-request-id': 'req_abcdef123456', 'x-org-id': 'org_ok123' },
      params: { scanId: 'scn_ok123' },
      url: '/scans/:scanId',
      method: 'GET',
    });
    attachRequestContext(request);
    expect(request.requestId).toBe('req_abcdef123456');
    expect(requestLogFields(request, 200)).toEqual({
      requestId: 'req_abcdef123456',
      orgId: 'org_ok123',
      scanId: 'scn_ok123',
      route: '/scans/:scanId',
      method: 'GET',
      statusCode: 200,
    });
  });

  it('generates a request id when the header is absent or malformed', () => {
    const request = fakeRequest({ headers: { 'x-request-id': 'bad id!' } });
    attachRequestContext(request);
    expect(request.requestId).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it('omits orgId and scanId that do not match the public-id shapes', () => {
    const request = fakeRequest({
      headers: { 'x-org-id': 'not an id; DROP TABLE' },
      params: { scanId: '../../etc/passwd' },
    });
    attachRequestContext(request);
    const fields = requestLogFields(request, 404);
    expect(fields).not.toHaveProperty('orgId');
    expect(fields).not.toHaveProperty('scanId');
    expect(fields.route).toBe('unmatched');
    expect(fields.statusCode).toBe(404);
  });
});
