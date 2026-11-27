import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { RepositoriesRepository } from '../repos/repositories.repository.js';
import { RulePackService } from '../rule-pack/rule-pack.service.js';
import { ScanScoringService } from '../scoring/scan-scoring.service.js';
import { AttestationsRepository } from './attestations.repository.js';
import {
  toAttestationView,
  writeAttestationSchema,
  type WriteAttestationInput,
} from './attestation.schemas.js';

// The concrete rescore method lands with the attestation-triggered rescore in
// Task 6. Binding by the ScanScoringService token keeps this task independently
// testable and green.
interface RepositoryRescorer {
  rescoreRepository(
    orgId: string,
    repositoryId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}

@Injectable()
export class AttestationsService {
  constructor(
    private readonly attestations: AttestationsRepository,
    private readonly repositories: RepositoriesRepository,
    private readonly pack: RulePackService,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    @Inject(ScanScoringService) private readonly scoring: RepositoryRescorer,
    private readonly prisma: PrismaService,
  ) {}

  async set(raw: WriteAttestationInput) {
    const input = writeAttestationSchema.parse(raw);
    if (input.expiresAt !== null && input.expiresAt !== undefined) {
      if (new Date(input.expiresAt).getTime() <= Date.now()) {
        throw new ApiError('VALIDATION_ERROR', 'An attestation must expire in the future.');
      }
    }

    const loaded = await this.pack.loadV2();
    if (!loaded.attestationsByKey.has(input.key)) {
      throw new ApiError('NOT_FOUND', 'The attestation key is not in the active rule pack.');
    }
    const membership = await this.identity.getMembership(input.orgId, input.attestedBy);
    if (
      membership === null ||
      membership.status !== 'active' ||
      !['owner', 'admin'].includes(String(membership.role))
    ) {
      throw new ApiError('FORBIDDEN', 'Only an active owner or admin can write attestations.');
    }
    const repository = await this.repositories.findActiveById(input.orgId, input.repositoryId);
    if (repository === null) throw new ApiError('NOT_FOUND', 'The repository does not exist.');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const row = await this.attestations.upsert(input, tx);
      await this.audit.record(
        {
          orgId: input.orgId,
          actorType: 'user',
          actorUserId: input.attestedBy,
          action: 'attestation.upserted',
          resourceType: 'attestation',
          resourceId: row.id,
          metadata: {
            repositoryId: input.repositoryId,
            key: input.key,
            answer: input.answer,
            expiresAt: input.expiresAt ?? null,
          },
        },
        tx,
      );
      await this.scoring.rescoreRepository(input.orgId, input.repositoryId, tx);
      return toAttestationView(row);
    });
  }

  async list(orgId: string, repositoryId: string) {
    const rows = await this.attestations.list(orgId, repositoryId);
    return rows.map(toAttestationView);
  }
}
