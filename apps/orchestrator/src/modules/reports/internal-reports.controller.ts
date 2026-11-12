import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { ReportsService } from './reports.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

/** Internal report API consumed by Nitro and the renderer (docs/api.md §10.6). */
@Controller('internal/v1/reports')
@UseGuards(InternalHmacGuard)
export class InternalReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':reportId/view-model')
  async viewModel(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('reportId') reportId: string,
  ) {
    return { data: await this.reports.viewModel(orgIdFrom(orgHeader), reportId) };
  }
}
