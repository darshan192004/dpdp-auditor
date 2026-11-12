import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { FindingsRepository } from '../findings/findings.repository.js';
import { buildReportViewModel } from './report-view-model.js';
import { ReportsRepository } from './reports.repository.js';

/** api.md §10.6. Read-only payload for the dashboard and the PDF renderer. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly findings: FindingsRepository,
  ) {}

  async viewModel(orgId: string, reportId: string) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');
    if (report.status === 'expired') {
      throw new ApiError('REPORT_EXPIRED', 'The report has expired.');
    }

    const findings = await this.findings.topForScan(report.scanId, orgId);
    return buildReportViewModel({
      report,
      scan: report.scan,
      organization: report.organization,
      findings,
    });
  }
}
