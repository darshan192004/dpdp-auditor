import { Injectable } from '@nestjs/common';
import type { ApiKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ApiKeyScope } from './api-key.schemas.js';

export interface CreateApiKeyRecord {
  orgId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  createdBy?: string | null;
  expiresAt?: Date | null;
}

/** Data access for `api_keys` (database.md §4.8). Only hashes are persisted. */
@Injectable()
export class ApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateApiKeyRecord, tx?: Prisma.TransactionClient): Promise<ApiKey> {
    return this.client(tx).apiKey.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        scopes: input.scopes,
        createdBy: input.createdBy ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  listForOrg(orgId: string, tx?: Prisma.TransactionClient): Promise<ApiKey[]> {
    return this.client(tx).apiKey.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(orgId: string, id: string, tx?: Prisma.TransactionClient): Promise<ApiKey | null> {
    return this.client(tx).apiKey.findFirst({ where: { id, orgId } });
  }

  findActiveByPrefix(prefix: string, tx?: Prisma.TransactionClient): Promise<ApiKey | null> {
    return this.client(tx).apiKey.findFirst({
      where: { keyPrefix: prefix, revokedAt: null },
    });
  }

  revoke(id: string, tx?: Prisma.TransactionClient): Promise<ApiKey> {
    return this.client(tx).apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  touchLastUsed(id: string, tx?: Prisma.TransactionClient): Promise<ApiKey> {
    return this.client(tx).apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  private client(tx?: Prisma.TransactionClient): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}
