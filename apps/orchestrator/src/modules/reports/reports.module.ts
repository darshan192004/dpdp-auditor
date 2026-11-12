import { Module } from '@nestjs/common';
import { FindingsModule } from '../findings/findings.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { InternalReportsController } from './internal-reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [FindingsModule, InternalAuthModule],
  controllers: [InternalReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
