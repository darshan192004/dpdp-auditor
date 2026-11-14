import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { IdentityService } from './identity.service.js';
import type {
  AddMemberByEmailInput,
  ChangeRoleInput,
  CreateSessionInput,
  GithubProfileInput,
  UpdateOrganizationInput,
} from './identity.schemas.js';
import { SessionService } from './session.service.js';

function userIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-User-Id is required.');
  return header;
}

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

/**
 * Internal identity API consumed by Nitro (docs/api.md §8/§10). Nitro owns the
 * sealed cookie; these routes own the durable user, session, membership, and
 * organisation state that makes the cookie revocable and tenant-scoped.
 */
@Controller('internal/v1/identity')
@UseGuards(InternalHmacGuard)
export class InternalIdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** GitHub profile → user; safe to replay on every sign-in. */
  @Post('users/upsert')
  @HttpCode(200)
  async upsertUser(@Body() body: GithubProfileInput) {
    return { data: await this.identity.upsertGithubUser(body) };
  }

  @Post('sessions')
  @HttpCode(201)
  async createSession(@Body() body: CreateSessionInput) {
    return { data: await this.sessions.create(body) };
  }

  /**
   * One call resolves the cookie into everything the app context needs:
   * the session (for revocation/expiry), the user, active memberships, and
   * feature flags. Nitro caches it on `event.context` for the request.
   */
  @Get('sessions/:sessionId')
  async resolveSession(@Param('sessionId') sessionId: string) {
    const session = await this.sessions.resolve(sessionId);
    const me = await this.identity.me(session.userId);
    return { data: { session, ...me, featureFlags: this.flags.all() } };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(@Param('sessionId') sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  /** API-key callers resolve a user without a browser session (P2-E). */
  @Get('me')
  async me(@Headers('x-user-id') userHeader: string | undefined) {
    const me = await this.identity.me(userIdFrom(userHeader));
    return { data: { ...me, featureFlags: this.flags.all() } };
  }

  /** Onboarding: the signed-in user becomes the owner (api.md §7.2). */
  @Post('orgs')
  @HttpCode(201)
  async createOrganization(
    @Headers('x-user-id') userHeader: string | undefined,
    @Body() body: { name: string; slug: string },
  ) {
    return {
      data: await this.identity.createOrganizationForUser(userIdFrom(userHeader), body),
    };
  }

  @Get('org')
  async getOrganization(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
  ) {
    return {
      data: await this.identity.getOrganization(orgIdFrom(orgHeader), userIdFrom(userHeader)),
    };
  }

  @Patch('org')
  async updateOrganization(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Body() body: UpdateOrganizationInput,
  ) {
    return {
      data: await this.identity.updateOrganization(
        orgIdFrom(orgHeader),
        userIdFrom(userHeader),
        body,
      ),
    };
  }

  @Get('org/members')
  async listMembers(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
  ) {
    return {
      data: await this.identity.listMemberViews(orgIdFrom(orgHeader), userIdFrom(userHeader)),
    };
  }

  @Post('org/members')
  @HttpCode(201)
  async addMember(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Body() body: AddMemberByEmailInput,
  ) {
    return {
      data: await this.identity.addMemberByEmail(
        orgIdFrom(orgHeader),
        userIdFrom(userHeader),
        body,
      ),
    };
  }

  @Patch('org/members/:userId')
  async changeMemberRole(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Param('userId') memberId: string,
    @Body() body: Pick<ChangeRoleInput, 'role'>,
  ) {
    return {
      data: await this.identity.changeRole(
        { orgId: orgIdFrom(orgHeader), userId: memberId, role: body.role },
        userIdFrom(userHeader),
      ),
    };
  }

  @Delete('org/members/:userId')
  @HttpCode(204)
  async removeMember(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Param('userId') memberId: string,
  ): Promise<void> {
    await this.identity.removeMember(orgIdFrom(orgHeader), memberId, userIdFrom(userHeader));
  }
}
