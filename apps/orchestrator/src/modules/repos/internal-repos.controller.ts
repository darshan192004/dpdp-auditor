import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import type { DisconnectRepoInput, ResolveRepoInput, SaveRepoInput } from './repo.schemas.js';
import { ReposService } from './repos.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

/**
 * Internal repos API consumed by Nitro (docs/api.md §5). Every route is HMAC
 * guarded and tenant-scoped by `X-Org-Id`. P2-C: resolve, save, list, detail,
 * disconnect with plan limit enforcement.
 */
@Controller('internal/v1/repos')
@UseGuards(InternalHmacGuard)
export class InternalReposController {
  constructor(private readonly repos: ReposService) {}

  /**
   * POST /internal/v1/repos/resolve
   * Preview a GitHub URL before save (default branch, size, visibility).
   */
  @Post('resolve')
  @HttpCode(200)
  async resolve(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Body() body: Omit<ResolveRepoInput, 'orgId'>,
  ) {
    return { data: await this.repos.resolve({ ...body, orgId: orgIdFrom(orgHeader) }) };
  }

  /**
   * POST /internal/v1/repos
   * Save a resolved public repo URL. Enforces PLAN_LIMITS.repositories.
   */
  @Post()
  @HttpCode(201)
  async save(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Body() body: Omit<SaveRepoInput, 'orgId' | 'actorUserId'>,
  ) {
    const input: SaveRepoInput = {
      ...body,
      orgId: orgIdFrom(orgHeader),
      actorUserId: userHeader ?? null,
    };
    return { data: await this.repos.save(input) };
  }

  /**
   * GET /internal/v1/repos
   * List active repositories for the organisation.
   */
  @Get()
  async list(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return {
      data: await this.repos.list({
        orgId: orgIdFrom(orgHeader),
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      }),
    };
  }

  /**
   * GET /internal/v1/repos/:repoId
   * Repository detail + stats (total scans, average score, trend).
   */
  @Get(':repoId')
  async detail(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('repoId') repoId: string,
  ) {
    return { data: await this.repos.detail(orgIdFrom(orgHeader), repoId) };
  }

  /**
   * DELETE /internal/v1/repos/:repoId
   * Soft delete (revokes future scans, schedules data retention).
   */
  @Delete(':repoId')
  @HttpCode(204)
  async disconnect(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Param('repoId') repoId: string,
    @Query('force') force?: string,
  ): Promise<void> {
    const input: DisconnectRepoInput = {
      orgId: orgIdFrom(orgHeader),
      repoId,
      actorUserId: userHeader ?? null,
      force: force === 'true',
    };
    await this.repos.disconnect(input);
  }
}
