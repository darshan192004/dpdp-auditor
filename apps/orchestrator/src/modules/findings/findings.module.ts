import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { ScansModule } from '../scans/scans.module.js';
import { FindingsRepository } from './findings.repository.js';
import { FindingsService } from './findings.service.js';
import { InternalFindingsController } from './internal-findings.controller.js';

@Module({
  imports: [ScansModule, InternalAuthModule],
  controllers: [InternalFindingsController],
  providers: [FindingsService, FindingsRepository],
  exports: [FindingsService, FindingsRepository],
})
export class FindingsModule {}
