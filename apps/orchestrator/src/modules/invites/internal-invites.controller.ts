import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import type { CreateInviteInput } from './invites.service.js';
import { InvitesService } from './invites.service.js';

function userIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-User-Id is required.');
  return header;
}

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

/**
 * Internal invites API consumed by Nitro (P2-21, P2-22). Hashed tokens, 7-day
 * expiry, pending membership activation, and audit trails.
 */
@Controller('internal/v1/identity/org/invites')
@UseGuards(InternalHmacGuard)
export class InternalInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @HttpCode(201)
  async createInvite(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Body() body: Omit<CreateInviteInput, 'orgId' | 'invitedBy'>,
  ) {
    const result = await this.invites.createInvite({
      orgId: orgIdFrom(orgHeader),
      email: body.email,
      role: body.role,
      invitedBy: userIdFrom(userHeader),
    });

    if (result.kind === 'member') {
      return { data: { kind: 'member', membership: result.membership } };
    }
    return {
      data: {
        kind: 'invite',
        invite: {
          id: result.invite.id,
          email: result.invite.email,
          role: result.invite.role,
          expiresAt: result.invite.expiresAt.toISOString(),
          createdAt: result.invite.createdAt.toISOString(),
        },
        token: result.token,
      },
    };
  }

  @Get()
  async listPending(@Headers('x-org-id') orgHeader: string | undefined) {
    const invites = await this.invites.listPending(orgIdFrom(orgHeader));
    return {
      data: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      })),
    };
  }

  @Delete(':inviteId')
  @HttpCode(204)
  async revokeInvite(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    // The service will handle validation that the invite belongs to the org
    await this.invites.revokeInvite(orgIdFrom(orgHeader), inviteId);
  }
}

/**
 * Public invite acceptance endpoint (no org context required).
 */
@Controller('internal/v1/invites')
@UseGuards(InternalHmacGuard)
export class InternalInviteAcceptController {
  constructor(private readonly invites: InvitesService) {}

  @Post(':token/accept')
  @HttpCode(200)
  async acceptInvite(
    @Headers('x-user-id') userHeader: string | undefined,
    @Param('token') token: string,
  ) {
    const membership = await this.invites.acceptInvite({
      token,
      userId: userIdFrom(userHeader),
    });
    return {
      data: {
        orgId: membership.orgId,
        userId: membership.userId,
        role: membership.role,
      },
    };
  }
}
