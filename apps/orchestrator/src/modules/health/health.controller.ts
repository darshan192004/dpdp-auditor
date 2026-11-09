import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('health')
  liveness() {
    return this.health.liveness();
  }

  @Get('ready')
  readiness() {
    return this.health.readiness();
  }

  @Get('internal/v1/health')
  @UseGuards(InternalHmacGuard)
  internalHealth() {
    return this.health.liveness();
  }
}
