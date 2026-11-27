import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { DetectorCatalogService } from './detector-catalog.service.js';

@Controller('internal/v1/detectors')
@UseGuards(InternalHmacGuard)
export class InternalDetectorsController {
  constructor(private readonly catalog: DetectorCatalogService) {}

  @Get()
  async list(@Headers('x-org-id') org: string | undefined) {
    if (!org) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
    return { data: await this.catalog.list() };
  }
}
