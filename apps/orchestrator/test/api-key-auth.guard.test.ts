import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
  ApiKeyGuard,
  ApiKeyScopesGuard,
  parseBearer,
  type ApiKeyRequest,
} from '../src/modules/api-keys/api-key-auth.guard.js';
import type { ApiKeysService } from '../src/modules/api-keys/api-keys.service.js';

const PRINCIPAL = {
  keyId: '44444444-4444-4444-8444-444444444444',
  orgId: '11111111-1111-4111-8111-111111111111',
  scopes: ['scan:read' as const],
};

function context(request: Partial<ApiKeyRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('parseBearer', () => {
  it('parses a bearer token and rejects other forms', () => {
    expect(parseBearer('Bearer abc')).toBe('abc');
    expect(parseBearer(['Bearer abc', 'Bearer def'])).toBe('abc');
    expect(parseBearer('bearer abc')).toBe('abc');
    expect(parseBearer('Basic abc')).toBeNull();
    expect(parseBearer('Bearer')).toBeNull();
    expect(parseBearer(undefined)).toBeNull();
  });
});

describe('ApiKeyGuard', () => {
  it('rejects a request without a bearer token', async () => {
    const apiKeys = { verifyToken: vi.fn() };
    const guard = new ApiKeyGuard(apiKeys as unknown as ApiKeysService);
    await expect(guard.canActivate(context({ headers: {} }))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an invalid key', async () => {
    const apiKeys = { verifyToken: vi.fn().mockResolvedValue(null) };
    const guard = new ApiKeyGuard(apiKeys as unknown as ApiKeysService);
    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer nope' } })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('attaches the principal to the request', async () => {
    const apiKeys = { verifyToken: vi.fn().mockResolvedValue(PRINCIPAL) };
    const guard = new ApiKeyGuard(apiKeys as unknown as ApiKeysService);
    const request: Partial<ApiKeyRequest> = { headers: { authorization: 'Bearer dpk_live_x' } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.apiKey).toEqual(PRINCIPAL);
  });
});

describe('ApiKeyScopesGuard', () => {
  function make(required: string[] | undefined) {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new ApiKeyScopesGuard(reflector);
  }

  it('allows handlers with no declared scopes', () => {
    expect(make(undefined).canActivate(context({}))).toBe(true);
    expect(make([]).canActivate(context({}))).toBe(true);
  });

  it('rejects a request with no authenticated key', () => {
    expect(() => make(['scan:read']).canActivate(context({}))).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects a key that lacks a required scope', () => {
    expect(() =>
      make(['scan:read', 'scan:write']).canActivate(context({ apiKey: PRINCIPAL })),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('allows a key with every required scope', () => {
    expect(make(['scan:read']).canActivate(context({ apiKey: PRINCIPAL }))).toBe(true);
  });
});
