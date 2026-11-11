import { Module } from '@nestjs/common';
import { RetentionRunner } from './retention.runner.js';
import { RetentionService } from './retention.service.js';

@Module({
  providers: [RetentionService, RetentionRunner],
  exports: [RetentionService],
})
export class RetentionModule {}
