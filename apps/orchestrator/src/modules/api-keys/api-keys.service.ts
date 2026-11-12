import { Injectable } from '@nestjs/common';
import type { ApiKey } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/api-error.js';
import { AuditService } from '../audit/audit.service.js';
import {
  createApiKeySchema,
  revokeApiKeySchema,
  type ApiKeyScope,
  type CreateApiKeyInput,
  type RevokeApiKeyInput,
} from './api-key.schemas.js';
import { ApiKeysRepository } from './api-keys.repository.js';

/** api.md §7.5: `dpk_live_` + 40 lowercase hex characters. */
export const API_KEY_PREFIX = 'dpk_live_';
const API_KEY_TOKEN = /^dpk_live_[0-9a-f]{40}$/;
const PREFIX_LENGTH = API_KEY_PREFIX.length + 4;
const VERIFY_CACHE_TTL_MS = 30_000;

export interface ApiKeyPrincipal {
  keyId: string;
  orgId: string;
  scopes: ApiKeyScope[];
}

export interface CreatedApiKey {
  record: ApiKey;
  /** Plaintext, shown once at creation and never persisted. */
  key: string;
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** SHA-256 over the plaintext key; only this digest is stored (database.md §4.8). */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function apiKeyPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH);
}

/**
 * P2-13 / P2-14. Keys are generated once, stored as SHA-256 hashes, and
 * verified through a 30 s in-process cache. Revocation evicts the cache entry
 * so a revoked key stops working immediately on the instance that revoked it.
 */
@Injectable()
export class ApiKeysService {
  private readonly cache = new Map<string, { principal: ApiKeyPrincipal; expiresAt: number }>();

  constructor(
    private readonly repo: ApiKeysRepository,
    private readonly audit: AuditService,
  ) {}

  async create(raw: CreateApiKeyInput): Promise<CreatedApiKey> {
    const input = createApiKeySchema.parse(raw);
    const token = `${API_KEY_PREFIX}${randomBytes(20).toString('hex')}`;
    const keyHash = hashApiKey(token);
    const keyPrefix = apiKeyPrefix(token);

    try {
      const record = await this.repo.create({
        orgId: input.orgId,
        name: input.name,
        keyPrefix,
        keyHash,
        scopes: input.scopes,
        createdBy: input.createdBy ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      await this.audit.record({
        orgId: record.orgId,
        actorType: input.createdBy ? 'user' : 'system',
        actorUserId: input.createdBy ?? null,
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: record.id,
        metadata: { name: record.name, scopes: record.scopes, prefix: record.keyPrefix },
      });
      return { record, key: token };
    } catch (error) {
      // A prefix collision is astronomically unlikely; surface it as a retryable conflict.
      if (isUniqueViolation(error)) {
        throw new ApiError('CONFLICT', 'An API key with that prefix already exists. Retry.');
      }
      throw error;
    }
  }

  async list(orgId: string): Promise<ApiKeyView[]> {
    const rows = await this.repo.listForOrg(orgId);
    return rows.map(toView);
  }

  /** Revocation is idempotent: revoking an already-revoked key is a no-op. */
  async revoke(raw: RevokeApiKeyInput): Promise<void> {
    const input = revokeApiKeySchema.parse(raw);
    const record = await this.repo.findById(input.orgId, input.keyId);
    if (!record) throw new ApiError('NOT_FOUND', 'The API key does not exist.');
    if (record.revokedAt) return;

    await this.repo.revoke(input.keyId);
    this.cache.delete(record.keyHash);
    await this.audit.record({
      orgId: record.orgId,
      actorType: input.actorUserId ? 'user' : 'system',
      actorUserId: input.actorUserId ?? null,
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: record.id,
      metadata: { name: record.name, prefix: record.keyPrefix },
    });
  }

  /**
   * Resolve a bearer token to its principal. Unknown, malformed, expired, and
   * revoked keys all return `null` so callers cannot distinguish them.
   */
  async verifyToken(token: string): Promise<ApiKeyPrincipal | null> {
    if (!API_KEY_TOKEN.test(token)) return null;
    const keyHash = hashApiKey(token);

    const cached = this.cache.get(keyHash);
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.principal;
      this.cache.delete(keyHash);
    }

    const record = await this.repo.findActiveByPrefix(apiKeyPrefix(token));
    if (!record || !hashesMatch(keyHash, record.keyHash)) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;

    const principal: ApiKeyPrincipal = {
      keyId: record.id,
      orgId: record.orgId,
      scopes: record.scopes as ApiKeyScope[],
    };
    this.cache.set(keyHash, { principal, expiresAt: Date.now() + VERIFY_CACHE_TTL_MS });
    await this.repo.touchLastUsed(record.id).catch(() => undefined);
    return principal;
  }

  /** Test seam: drop the 30 s cache entry for a hash. */
  clearCache(): void {
    this.cache.clear();
  }
}

function toView(record: ApiKey): ApiKeyView {
  return {
    id: record.id,
    name: record.name,
    prefix: record.keyPrefix,
    scopes: record.scopes,
    createdBy: record.createdBy,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

function hashesMatch(providedHex: string, storedHex: string): boolean {
  const provided = Buffer.from(providedHex, 'hex');
  const stored = Buffer.from(storedHex, 'hex');
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
