import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service.js';
import { MembershipsRepository } from './memberships.repository.js';
import { OrganizationsRepository } from './organizations.repository.js';
import { UsersRepository } from './users.repository.js';

@Module({
  providers: [IdentityService, UsersRepository, OrganizationsRepository, MembershipsRepository],
  exports: [IdentityService, UsersRepository, OrganizationsRepository, MembershipsRepository],
})
export class IdentityModule {}
