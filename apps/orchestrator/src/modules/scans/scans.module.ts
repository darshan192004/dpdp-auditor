import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { ReposModule } from '../repos/repos.module.js';
import { InternalScansController } from './internal-scans.controller.js';
import { ScansRepository } from './scans.repository.js';
import { ScansService } from './scans.service.js';

@Module({
  imports: [IdentityModule, ReposModule, InternalAuthModule],
  controllers: [InternalScansController],
  providers: [ScansService, ScansRepository],
  exports: [ScansService, ScansRepository],
})
export class ScansModule {}
