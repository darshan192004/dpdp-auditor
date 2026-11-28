import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { FindingsModule } from '../findings/findings.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { RulePackModule } from '../rule-pack/rule-pack.module.js';
import { ScansModule } from '../scans/scans.module.js';
import { EmailService } from './email.service.js';
import { InternalReportsController } from './internal-reports.controller.js';
import { ReportRenderRunner } from './report-render.worker.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportV2Service } from './report-v2.service.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    PrismaModule,
    FindingsModule,
    InternalAuthModule,
    AuditModule,
    ScansModule,
    RulePackModule,
    forwardRef(() => IdentityModule),
  ],
  controllers: [InternalReportsController],
  providers: [
    ReportsService,
    ReportV2Service,
    ReportsRepository,
    ReportStorageService,
    ReportRenderRunner,
    EmailService,
  ],
  exports: [ReportsService, ReportV2Service, ReportRenderRunner, ReportsRepository],
})
export class ReportsModule {}
