import { Controller, Get, Inject } from '@nestjs/common';
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
  internalHealth() {
    return this.health.liveness();
  }
}
