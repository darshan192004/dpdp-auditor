import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [InternalAuthModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
