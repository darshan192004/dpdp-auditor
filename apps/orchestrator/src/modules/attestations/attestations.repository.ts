import { Injectable } from '@nestjs/common';
import { Prisma, type Attestation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { WriteAttestationInput } from './attestation.schemas.js';

@Injectable()
export class AttestationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string, repositoryId: string, tx?: Prisma.TransactionClient) {
    return this.client(tx).attestation.findMany({
      where: { orgId, repositoryId },
      orderBy: { key: 'asc' },
    });
  }

  activeByRepository(orgId: string, repositoryId: string, tx?: Prisma.TransactionClient) {
    const now = new Date();
    return this.client(tx).attestation.findMany({
      where: {
        orgId,
        repositoryId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { key: 'asc' },
    });
  }

  upsert(input: WriteAttestationInput, tx?: Prisma.TransactionClient): Promise<Attestation> {
    return this.client(tx).attestation.upsert({
      where: {
        orgId_repositoryId_key: {
          orgId: input.orgId,
          repositoryId: input.repositoryId,
          key: input.key,
        },
      },
      create: {
        orgId: input.orgId,
        repositoryId: input.repositoryId,
        key: input.key,
        answer: input.answer,
        note: input.note ?? null,
        attestedBy: input.attestedBy,
        expiresAt:
          input.expiresAt === null || input.expiresAt === undefined
            ? null
            : new Date(input.expiresAt),
      },
      update: {
        answer: input.answer,
        note: input.note ?? null,
        attestedBy: input.attestedBy,
        attestedAt: new Date(),
        expiresAt:
          input.expiresAt === null || input.expiresAt === undefined
            ? null
            : new Date(input.expiresAt),
      },
    });
  }

  private client(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }
}
