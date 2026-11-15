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
import type { CreateApiKeyInput, RevokeApiKeyInput } from './api-key.schemas.js';
import { ApiKeysService } from './api-keys.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

/**
 * Internal API-key management consumed by Nitro (docs/api.md §7.5, P2-13).
 * The plaintext key is returned exactly once, on creation.
 */
@Controller('internal/v1/identity/org/api-keys')
@UseGuards(InternalHmacGuard)
export class InternalApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  async list(@Headers('x-org-id') orgHeader: string | undefined) {
    const views = await this.apiKeys.list(orgIdFrom(orgHeader));
    return { data: views.map(toIsoView) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Body() body: Omit<CreateApiKeyInput, 'orgId' | 'createdBy'>,
  ) {
    const input: CreateApiKeyInput = {
      ...body,
      orgId: orgIdFrom(orgHeader),
      createdBy: userHeader ?? null,
    };
    const created = await this.apiKeys.create(input);
    return {
      data: {
        id: created.record.id,
        name: created.record.name,
        prefix: created.record.keyPrefix,
        scopes: created.record.scopes,
        expiresAt: created.record.expiresAt?.toISOString() ?? null,
        createdAt: created.record.createdAt.toISOString(),
        key: created.key,
      },
    };
  }

  @Delete(':keyId')
  @HttpCode(204)
  async revoke(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Headers('x-user-id') userHeader: string | undefined,
    @Param('keyId') keyId: string,
  ): Promise<void> {
    const input: RevokeApiKeyInput = {
      orgId: orgIdFrom(orgHeader),
      keyId,
      actorUserId: userHeader ?? null,
    };
    await this.apiKeys.revoke(input);
  }
}

function toIsoView(view: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: view.id,
    name: view.name,
    prefix: view.prefix,
    scopes: view.scopes,
    createdBy: view.createdBy,
    lastUsedAt: view.lastUsedAt?.toISOString() ?? null,
    expiresAt: view.expiresAt?.toISOString() ?? null,
    revokedAt: view.revokedAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString(),
  };
}
