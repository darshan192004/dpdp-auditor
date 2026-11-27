import { Controller, Get, Headers, Param, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { ReadinessReadService } from './readiness-read.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

@Controller('internal/v1/scans')
@UseGuards(InternalHmacGuard)
export class InternalReadinessController {
  constructor(private readonly readiness: ReadinessReadService) {}

  @Get(':scanId/inventory')
  inventory(@Headers('x-org-id') org: string | undefined, @Param('scanId') scanId: string) {
    return { data: this.readiness.inventory(orgIdFrom(org), scanId) };
  }

  @Get(':scanId/gaps')
  gaps(@Headers('x-org-id') org: string | undefined, @Param('scanId') scanId: string) {
    return { data: this.readiness.gaps(orgIdFrom(org), scanId) };
  }

  @Get(':scanId/fix-plan')
  fixPlan(@Headers('x-org-id') org: string | undefined, @Param('scanId') scanId: string) {
    return { data: this.readiness.fixPlan(orgIdFrom(org), scanId) };
  }
}
