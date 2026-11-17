import { Module, forwardRef } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { IdentityService } from './identity.service.js';
import { InternalIdentityController } from './internal-identity.controller.js';
import { MembershipsRepository } from './memberships.repository.js';
import { OrganizationsRepository } from './organizations.repository.js';
import { SessionService } from './session.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';
import { ReportsModule } from '../reports/reports.module.js';
import { ScansModule } from '../scans/scans.module.js';

@Module({
  imports: [InternalAuthModule, forwardRef(() => ReportsModule), forwardRef(() => ScansModule)],
  controllers: [InternalIdentityController],
  providers: [
    IdentityService,
    SessionService,
    UsersRepository,
    OrganizationsRepository,
    MembershipsRepository,
    SessionsRepository,
  ],
  exports: [
    IdentityService,
    SessionService,
    UsersRepository,
    OrganizationsRepository,
    MembershipsRepository,
    SessionsRepository,
  ],
})
export class IdentityModule {}
