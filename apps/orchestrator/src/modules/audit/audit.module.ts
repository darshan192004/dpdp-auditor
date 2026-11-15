import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { InternalAuditController } from './internal-audit.controller.js';

@Global()
@Module({
  controllers: [InternalAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
