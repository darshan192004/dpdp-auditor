import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { InvitesRepository } from './invites.repository.js';
import { InvitesService } from './invites.service.js';

@Module({
  imports: [IdentityModule],
  providers: [InvitesService, InvitesRepository],
  exports: [InvitesService, InvitesRepository],
})
export class InvitesModule {}
