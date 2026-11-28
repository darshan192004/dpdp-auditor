import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { ReposModule } from '../repos/repos.module.js';
import { RulePackModule } from '../rule-pack/rule-pack.module.js';
import { ScansModule } from '../scans/scans.module.js';
import { AttestationsRepository } from './attestations.repository.js';
import { AttestationsService } from './attestations.service.js';
import { InternalAttestationsController } from './internal-attestations.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    IdentityModule,
    InternalAuthModule,
    ReposModule,
    RulePackModule,
    ScansModule,
  ],
  controllers: [InternalAttestationsController],
  providers: [AttestationsRepository, AttestationsService],
  exports: [AttestationsRepository, AttestationsService],
})
export class AttestationsModule {}
