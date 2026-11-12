import { Body, Controller, Get, Headers, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import type { ListFindingsInput, TriageFindingInput } from './findings.schemas.js';
import { FindingsService } from './findings.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function all(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function int(value: string | string[] | undefined, fallback: number): number {
  const parsed = Number.parseInt(first(value) ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Internal findings API consumed by Nitro (docs/api.md §4). */
@Controller('internal/v1')
@UseGuards(InternalHmacGuard)
export class InternalFindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get('scans/:scanId/findings')
  async list(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('scanId') scanId: string,
    @Query() query: Record<string, string | string[] | undefined>,
  ) {
    return this.findings.list(orgIdFrom(orgHeader), scanId, listQuery(query));
  }

  @Patch('findings/:findingId')
  async triage(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Param('findingId') findingId: string,
    @Body() body: Omit<TriageFindingInput, 'orgId' | 'findingId' | 'actorUserId'>,
  ) {
    const data = await this.findings.triage(orgIdFrom(orgHeader), findingId, {
      ...body,
      ...(userHeader ? { actorUserId: userHeader } : {}),
    });
    return { data };
  }
}

function listQuery(
  query: Record<string, string | string[] | undefined>,
): Partial<ListFindingsInput> {
  const sort = first(query.sort);
  return {
    ...(all(query.severity) === undefined
      ? {}
      : { severity: all(query.severity) as ListFindingsInput['severity'] }),
    ...(all(query.scanner) === undefined
      ? {}
      : { scanner: all(query.scanner) as ListFindingsInput['scanner'] }),
    ...(all(query.section) === undefined ? {} : { section: all(query.section) }),
    ...(all(query.status) === undefined
      ? {}
      : { status: all(query.status) as ListFindingsInput['status'] }),
    ...(first(query.file) === undefined ? {} : { file: first(query.file) }),
    ...(first(query.q) === undefined ? {} : { q: first(query.q) }),
    ...(sort === undefined ? {} : { sort: sort as ListFindingsInput['sort'] }),
    page: int(query.page, 1),
    pageSize: int(query.pageSize, 50),
  };
}
