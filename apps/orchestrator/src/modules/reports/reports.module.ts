import { Module } from '@nestjs/common';
import { FindingsModule } from '../findings/findings.module.js';
import { ScansModule } from '../scans/scans.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { InternalReportsController } from './internal-reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import { ReportStorageService } from './report-storage.service.js';
import { ReportRenderRunner } from './report-render.worker.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [FindingsModule, InternalAuthModule, AuditModule, ScansModule, IdentityModule],
  controllers: [InternalReportsController],
  providers: [
    ReportsService,
    ReportsRepository,
    ReportStorageService,
    ReportRenderRunner,
    EmailService,
  ],
  exports: [ReportsService, ReportRenderRunner],
})
export class ReportsModule {}
