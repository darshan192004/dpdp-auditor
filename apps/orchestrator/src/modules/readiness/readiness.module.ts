import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { RulePackModule } from '../rule-pack/rule-pack.module.js';
import { DetectorCatalogService } from './detector-catalog.service.js';
import { InternalDetectorsController } from './internal-detectors.controller.js';
import { InternalReadinessController } from './internal-readiness.controller.js';
import { ReadinessReadService } from './readiness-read.service.js';

@Module({
  imports: [PrismaModule, InternalAuthModule, RulePackModule],
  controllers: [InternalReadinessController, InternalDetectorsController],
  providers: [ReadinessReadService, DetectorCatalogService],
  exports: [ReadinessReadService, DetectorCatalogService],
})
export class ReadinessModule {}
