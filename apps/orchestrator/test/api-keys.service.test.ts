import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { ApiKey } from '@prisma/client';
import {
  ApiKeysService,
  apiKeyPrefix,
  hashApiKey,
} from '../src/modules/api-keys/api-keys.service.js';
import type { ApiKeysRepository } from '../src/modules/api-keys/api-keys.repository.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const KEY_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '22222222-2222-4222-9222-222222222222';
const TOKEN = `dpk_live_${'a'.repeat(40)}`;

function make() {
  const repo = {
    create: vi.fn(),
    listForOrg: vi.fn(),
    findById: vi.fn(),
    findActiveByPrefix: vi.fn(),
    revoke: vi.fn(),
    touchLastUsed: vi.fn().mockResolvedValue({}),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ApiKeysService(
    repo as unknown as ApiKeysRepository,
    audit as unknown as AuditService,
  );
  return { service, repo, audit };
}

function record(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: KEY_ID,
    orgId: ORG_ID,
    name: 'CI',
    keyPrefix: apiKeyPrefix(TOKEN),
    keyHash: hashApiKey(TOKEN),
    scopes: ['scan:read'],
    createdBy: USER_ID,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ApiKeysService.create', () => {
  it('generates a dpk_live_ key, stores only the hash, and audits creation', async () => {
    const { service, repo, audit } = make();
    repo.create.mockImplementation(async (input: { keyHash: string; keyPrefix: string }) =>
      record({ keyHash: input.keyHash, keyPrefix: input.keyPrefix }),
    );

    const result = await service.create({
      orgId: ORG_ID,
      name: ' GitHub Actions ',
      scopes: ['scan:read', 'scan:write'],
      createdBy: USER_ID,
      expiresAt: '2027-11-04T00:00:00.000Z',
    });

    expect(result.key).toMatch(/^dpk_live_[0-9a-f]{40}$/);
    expect(result.key).not.toBe(TOKEN);
    const stored = repo.create.mock.calls[0]?.[0] as {
      keyHash: string;
      keyPrefix: string;
      name: string;
      expiresAt: Date;
    };
    expect(stored.keyHash).toBe(hashApiKey(result.key));
    expect(stored.keyPrefix).toBe(apiKeyPrefix(result.key));
    expect(stored.name).toBe('GitHub Actions');
    expect(stored.expiresAt).toEqual(new Date('2027-11-04T00:00:00.000Z'));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.created', orgId: ORG_ID }),
    );
  });

  it('defaults scopes to scan:read and createdBy to null', async () => {
    const { service, repo } = make();
    repo.create.mockResolvedValue(record({ createdBy: null }));

    await service.create({ orgId: ORG_ID, name: 'CI' });

    const stored = repo.create.mock.calls[0]?.[0] as { scopes: string[]; createdBy: null };
    expect(stored.scopes).toEqual(['scan:read']);
    expect(stored.createdBy).toBeNull();
  });

  it('maps a unique-index race to CONFLICT', async () => {
    const { service, repo } = make();
    repo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    await expect(service.create({ orgId: ORG_ID, name: 'CI' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('rethrows unrelated database errors', async () => {
    const { service, repo } = make();
    repo.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.create({ orgId: ORG_ID, name: 'CI' })).rejects.toThrow('connection lost');
  });

  it('rejects an invalid name and a past expiry', async () => {
    const { service } = make();
    await expect(service.create({ orgId: ORG_ID, name: ' ' })).rejects.toThrow();
    await expect(
      service.create({ orgId: ORG_ID, name: 'CI', expiresAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toThrow();
  });
});

describe('ApiKeysService.list and revoke', () => {
  it('lists keys without the hash', async () => {
    const { service, repo } = make();
    repo.listForOrg.mockResolvedValue([record()]);

    const [view] = await service.list(ORG_ID);

    expect(view).toMatchObject({ id: KEY_ID, prefix: apiKeyPrefix(TOKEN) });
    expect(view).not.toHaveProperty('keyHash');
  });

  it('revokes a key, evicts the cache, and audits', async () => {
    const { service, repo, audit } = make();
    repo.findActiveByPrefix.mockResolvedValue(record());
    await service.verifyToken(TOKEN);
    repo.findById.mockResolvedValue(record());
    repo.revoke.mockResolvedValue(record({ revokedAt: new Date() }));
    repo.findActiveByPrefix.mockResolvedValue(null);

    await service.revoke({ orgId: ORG_ID, keyId: KEY_ID, actorUserId: USER_ID });

    expect(repo.revoke).toHaveBeenCalledWith(KEY_ID);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_key.revoked' }),
    );
    await expect(service.verifyToken(TOKEN)).resolves.toBeNull();
    expect(repo.findActiveByPrefix).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown key', async () => {
    const { service, repo } = make();
    repo.findById.mockResolvedValue(null);

    await expect(service.revoke({ orgId: ORG_ID, keyId: KEY_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('treats an already-revoked key as a no-op', async () => {
    const { service, repo, audit } = make();
    repo.findById.mockResolvedValue(record({ revokedAt: new Date() }));

    await service.revoke({ orgId: ORG_ID, keyId: KEY_ID });

    expect(repo.revoke).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('ApiKeysService.verifyToken', () => {
  it('returns null for malformed tokens without touching the database', async () => {
    const { service, repo } = make();
    await expect(service.verifyToken('not-a-key')).resolves.toBeNull();
    await expect(service.verifyToken(`dpk_live_${'Z'.repeat(40)}`)).resolves.toBeNull();
    expect(repo.findActiveByPrefix).not.toHaveBeenCalled();
  });

  it('returns null for unknown, mismatched, and expired keys', async () => {
    const { service, repo } = make();
    repo.findActiveByPrefix.mockResolvedValueOnce(null);
    await expect(service.verifyToken(TOKEN)).resolves.toBeNull();

    repo.findActiveByPrefix.mockResolvedValueOnce(record({ keyHash: 'b'.repeat(64) }));
    await expect(service.verifyToken(TOKEN)).resolves.toBeNull();

    repo.findActiveByPrefix.mockResolvedValueOnce(
      record({ expiresAt: new Date(Date.now() - 1_000) }),
    );
    await expect(service.verifyToken(TOKEN)).resolves.toBeNull();
  });

  it('resolves a valid key and caches the principal for 30 s', async () => {
    const { service, repo } = make();
    repo.findActiveByPrefix.mockResolvedValue(record());

    await expect(service.verifyToken(TOKEN)).resolves.toEqual({
      keyId: KEY_ID,
      orgId: ORG_ID,
      scopes: ['scan:read'],
    });
    await expect(service.verifyToken(TOKEN)).resolves.toMatchObject({ keyId: KEY_ID });
    expect(repo.findActiveByPrefix).toHaveBeenCalledTimes(1);
    expect(repo.touchLastUsed).toHaveBeenCalledTimes(1);
  });

  it('re-queries once the 30 s cache entry expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T00:00:00.000Z'));
    const { service, repo } = make();
    repo.findActiveByPrefix.mockResolvedValue(record());

    await service.verifyToken(TOKEN);
    vi.setSystemTime(new Date('2026-11-12T00:00:31.000Z'));
    await service.verifyToken(TOKEN);

    expect(repo.findActiveByPrefix).toHaveBeenCalledTimes(2);
  });

  it('does not fail authentication when last-used bookkeeping fails', async () => {
    const { service, repo } = make();
    repo.findActiveByPrefix.mockResolvedValue(record());
    repo.touchLastUsed.mockRejectedValue(new Error('write failed'));

    await expect(service.verifyToken(TOKEN)).resolves.toMatchObject({ keyId: KEY_ID });
  });

  it('clearCache drops cached principals', async () => {
    const { service, repo } = make();
    repo.findActiveByPrefix.mockResolvedValue(record());
    await service.verifyToken(TOKEN);
    service.clearCache();
    await service.verifyToken(TOKEN);
    expect(repo.findActiveByPrefix).toHaveBeenCalledTimes(2);
  });
});
