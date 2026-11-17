import { Module } from '@nestjs/common';
import { InternalAuthModule } from '../internal-auth/internal-auth.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import {
  InternalInviteAcceptController,
  InternalInvitesController,
} from './internal-invites.controller.js';
import { InvitesRepository } from './invites.repository.js';
import { InvitesService } from './invites.service.js';

@Module({
  imports: [IdentityModule, InternalAuthModule],
  controllers: [InternalInvitesController, InternalInviteAcceptController],
  providers: [InvitesService, InvitesRepository],
  exports: [InvitesService, InvitesRepository],
})
export class InvitesModule {}
