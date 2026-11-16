import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import type {
  CompleteScanInput,
  CreateScanInput,
  FindingsBatchInput,
  ListScansInput,
} from './scan.schemas.js';
import { ScansService } from './scans.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

/**
 * Internal scan API consumed by Nitro (docs/api.md A10). Every route is HMAC
 * guarded and tenant-scoped by `X-Org-Id`.
 */
@Controller('internal/v1/scans')
@UseGuards(InternalHmacGuard)
export class InternalScansController {
  constructor(private readonly scans: ScansService) {}

  /**
   * GET /internal/v1/scans
   * List scans for the org, with filters and pagination (api.md A3.4).
   */
  @Get()
  async list(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Query('repositoryId') repositoryId?: string,
    @Query('status') status?: string | string[],
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    const input: ListScansInput = {
      orgId: orgIdFrom(orgHeader),
      ...(repositoryId ? { repositoryId } : {}),
      ...(status
        ? {
            status: (Array.isArray(status) ? status : [status]).map(
              (s) => s,
            ) as ListScansInput['status'],
          }
        : {}),
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      sort: (sort as 'createdAt' | '-createdAt' | 'score' | '-score') ?? '-createdAt',
    };
    return { data: await this.scans.list(input) };
  }

  @Post()
  @HttpCode(202)
  async create(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Body() body: Omit<CreateScanInput, 'orgId'>,
  ) {
    const data = await this.scans.create({ ...body, orgId: orgIdFrom(orgHeader) });
    return { data };
  }

  @Get(':scanId')
  async detail(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
  ) {
    return { data: await this.scans.detail(orgIdFrom(orgHeader), scanId) };
  }

  @Get(':scanId/events')
  async events(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
  ) {
    return { data: await this.scans.events(orgIdFrom(orgHeader), scanId) };
  }

  @Post(':scanId/cancel')
  @HttpCode(202)
  async cancel(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
    @Body() body: { reason?: string },
  ) {
    const data = await this.scans.cancel(orgIdFrom(orgHeader), scanId, {
      reason: body?.reason,
    });
    return { data };
  }

  @Post(':scanId/findings')
  @HttpCode(200)
  async findings(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
    @Body() body: FindingsBatchInput,
  ) {
    return { data: await this.scans.recordFindings(orgIdFrom(orgHeader), scanId, body) };
  }

  @Post(':scanId/complete')
  @HttpCode(200)
  async complete(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
    @Body() body: CompleteScanInput,
  ) {
    return { data: await this.scans.complete(orgIdFrom(orgHeader), scanId, body) };
  }

  /** P4-24: derive a fresh score without rewriting the completed scan. */
  @Post(':scanId/rescore')
  @HttpCode(200)
  async rescore(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
  ) {
    return { data: await this.scans.rescore(orgIdFrom(orgHeader), scanId) };
  }
}
