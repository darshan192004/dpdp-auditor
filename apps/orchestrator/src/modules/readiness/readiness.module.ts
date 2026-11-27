import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { InternalReadinessController } from './internal-readiness.controller.js';
import { ReadinessReadService } from './readiness-read.service.js';

@Module({
  imports: [PrismaModule, InternalAuthModule],
  controllers: [InternalReadinessController],
  providers: [ReadinessReadService],
  exports: [ReadinessReadService],
})
export class ReadinessModule {}
