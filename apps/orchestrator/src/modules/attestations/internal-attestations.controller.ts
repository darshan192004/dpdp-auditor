import { Body, Controller, Get, Headers, Param, Put, UseGuards } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { InternalHmacGuard } from '../internal-auth/internal-hmac.guard.js';
import { AttestationsService } from './attestations.service.js';

function orgIdFrom(header: string | undefined): string {
  if (!header) throw new ApiError('VALIDATION_ERROR', 'X-Org-Id is required.');
  return header;
}

@Controller('internal/v1/repos')
@UseGuards(InternalHmacGuard)
export class InternalAttestationsController {
  constructor(private readonly attestations: AttestationsService) {}

  @Get(':repositoryId/attestations')
  list(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('repositoryId') repositoryId: string,
  ) {
    return { data: this.attestations.list(orgIdFrom(orgHeader), repositoryId) };
  }

  @Put(':repositoryId/attestations/:key')
  put(
    @Headers('x-org-id') orgHeader: string | undefined,
    @Param('repositoryId') repositoryId: string,
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      data: this.attestations.set({
        orgId: orgIdFrom(orgHeader),
        repositoryId,
        key,
        answer: body.answer as boolean,
        note: (body.note as string | null | undefined) ?? null,
        expiresAt: (body.expiresAt as string | null | undefined) ?? null,
        attestedBy: String(body.actorUserId),
      }),
    };
  }
}
