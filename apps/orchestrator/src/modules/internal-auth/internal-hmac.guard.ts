import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  type RawBodyRequest,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { verifyInternalRequest } from '../../common/hmac.js';
import { ENV, type Env } from '../../config/env.js';

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class InternalHmacGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<FastifyRequest>>();
    const headers = request.headers;
    const result = verifyInternalRequest({
      secret: this.env.ORCHESTRATOR_HMAC_KEY,
      internalKey: this.env.ORCHESTRATOR_INTERNAL_KEY,
      providedInternalKey: header(headers['x-internal-key']),
      timestamp: header(headers['x-internal-timestamp']),
      signature: header(headers['x-internal-signature']),
      rawBody: request.rawBody ? request.rawBody.toString('utf8') : '',
      nowSeconds: Math.floor(Date.now() / 1000),
      maxSkewSeconds: 300,
    });
    if (!result.ok) {
      // The envelope (code, requestId) is built by ApiExceptionFilter (P1-14);
      // clients see the same contract body as before.
      throw new UnauthorizedException('The internal request could not be authenticated.');
    }
    return true;
  }
}
