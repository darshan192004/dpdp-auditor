import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { createReportSchema } from './report.schemas.js';
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

  /** POST /internal/v1/reports — request a PDF for a completed scan (api.md §6.1). */
  @Post()
  @HttpCode(202)
  async create(@Headers('x-org-id') orgHeader: string | undefined, @Body() body: unknown) {
    const input = createReportSchema.parse({
      orgId: orgIdFrom(orgHeader),
      ...(typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}),
    });
    return { data: await this.reports.request(input) };
  }

  /** GET /internal/v1/reports/:reportId/status — api.md §6.2. */
  @Get(':reportId/status')
  async status(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('reportId') reportId: string,
  ) {
    return { data: await this.reports.status(orgIdFrom(orgHeader), reportId) };
  }

  /** GET /internal/v1/reports/:reportId/download — signed URL, 15 minutes (api.md §6.3). */
  @Get(':reportId/download')
  async download(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('reportId') reportId: string,
  ) {
    const orgId = orgIdFrom(orgHeader);
    return { data: await this.reports.downloadUrl(orgId, reportId) };
  }

  /** GET /internal/v1/reports/:reportId/view-model — renderer data (api.md §10.6). */
  @Get(':reportId/view-model')
  async viewModel(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('reportId') reportId: string,
  ) {
    return { data: await this.reports.viewModel(orgIdFrom(orgHeader), reportId) };
  }

  /** POST /internal/v1/reports/:reportId/complete — renderer completion callback (api.md §10.6). */
  @Post(':reportId/complete')
  async complete(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
  ) {
    return { data: await this.reports.complete(orgIdFrom(orgHeader), reportId, body) };
  }
}
