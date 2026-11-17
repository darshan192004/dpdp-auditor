import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Query,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { AuditService } from './audit.service.js';
import type { AuditListFilters, AuditExportFilters } from './audit.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

function userIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-User-Id is required.');
  return header;
}

interface AuditLogQueryParams {
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}

interface AuditExportQueryParams {
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  format?: string;
}

/**
 * Internal audit API consumed by Nitro (docs/api.md §7.4).
 * Owner and admin roles only (enforced by the BFF layer).
 */
@Controller('internal/v1/audit')
@UseGuards(InternalHmacGuard)
export class InternalAuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * GET /internal/v1/audit-logs — list audit logs with pagination and filters.
   */
  @Get('audit-logs')
  async list(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') _userHeader: string | undefined,
    @Query() query: AuditLogQueryParams,
  ) {
    const orgId = orgIdFrom(orgHeader);

    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 50;

    if (page < 1) {
      throw new ApiError('VALIDATION_ERROR', 'page must be at least 1.');
    }
    if (pageSize < 1 || pageSize > 100) {
      throw new ApiError('VALIDATION_ERROR', 'pageSize must be between 1 and 100.');
    }

    const filters: AuditListFilters = {
      orgId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    };

    const { entries, total } = await this.audit.list(filters, page, pageSize);

    // Transform to API format (api.md §7.4)
    const data = entries.map((entry) => ({
      id: Number(entry.id),
      actor: {
        type: entry.actorType,
        id: entry.actorUserId,
        name: entry.actor?.name ?? null,
      },
      action: entry.action,
      resource: {
        type: entry.resourceType,
        id: entry.resourceId,
      },
      ip: entry.ip,
      userAgent: entry.userAgent,
      metadata: entry.metadata as Record<string, unknown>,
      createdAt: entry.createdAt.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * GET /internal/v1/audit-logs/export — stream audit logs as NDJSON.
   * Capped at 100k rows; emits `audit.exported` event.
   */
  @Get('audit-logs/export')
  @HttpCode(200)
  async export(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Query() query: AuditExportQueryParams,
  ) {
    const orgId = orgIdFrom(orgHeader);
    const userId = userIdFrom(userHeader);

    const filters: AuditExportFilters = {
      orgId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    };

    const stream = Readable.from(this.createExportStream(filters, orgId, userId));

    return new StreamableFile(stream, {
      type: 'application/x-ndjson',
      disposition: `attachment; filename="audit-logs-${orgId}-${new Date().toISOString().split('T')[0]}.jsonl"`,
    });
  }

  private async *createExportStream(
    filters: AuditExportFilters,
    orgId: string,
    userId: string,
  ): AsyncGenerator<string> {
    const MAX_ROWS = 100_000;
    let rowCount = 0;
    let truncated = false;
    let lastCreatedAt: Date | undefined;

    for await (const entry of this.audit.export(filters)) {
      if (rowCount >= MAX_ROWS) {
        truncated = true;
        lastCreatedAt = entry.createdAt;
        break;
      }

      const row = {
        id: Number(entry.id),
        actor: {
          type: entry.actorType,
          id: entry.actorUserId,
          name: entry.actor?.name ?? null,
        },
        action: entry.action,
        resource: {
          type: entry.resourceType,
          id: entry.resourceId,
        },
        ip: entry.ip,
        userAgent: entry.userAgent,
        metadata: entry.metadata as Record<string, unknown>,
        createdAt: entry.createdAt.toISOString(),
      };

      yield JSON.stringify(row) + '\n';
      rowCount++;
    }

    // Emit audit.exported event (api.md §7.4)
    await this.audit.record({
      orgId,
      actorType: 'user',
      actorUserId: userId,
      action: 'audit.exported',
      resourceType: 'audit',
      resourceId: null,
      metadata: {
        rowCount,
        truncated,
        filters: {
          action: filters.action,
          actorUserId: filters.actorUserId,
          from: filters.from?.toISOString(),
          to: filters.to?.toISOString(),
        },
      },
    });

    // Emit truncation record if capped
    if (truncated && lastCreatedAt) {
      const truncationRecord = {
        truncated: true,
        nextFrom: lastCreatedAt.toISOString(),
      };
      yield JSON.stringify(truncationRecord) + '\n';
    }
  }
}
