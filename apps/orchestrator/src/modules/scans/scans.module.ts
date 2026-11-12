import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { ReposModule } from '../repos/repos.module.js';
import { RulePackModule } from '../rule-pack/rule-pack.module.js';
import { ScanScoringService } from '../scoring/scan-scoring.service.js';
import { InternalScansController } from './internal-scans.controller.js';
import { ScansRepository } from './scans.repository.js';
import { ScansService } from './scans.service.js';

@Module({
  imports: [IdentityModule, ReposModule, InternalAuthModule, RulePackModule],
  controllers: [InternalScansController],
  providers: [ScansService, ScansRepository, ScanScoringService],
  exports: [ScansService, ScansRepository, ScanScoringService],
})
export class ScansModule {}
