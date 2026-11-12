import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  type CustomDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../common/api-error.js';
import { ApiKeysService, type ApiKeyPrincipal } from './api-keys.service.js';
import type { ApiKeyScope } from './api-key.schemas.js';

export interface ApiKeyRequest extends FastifyRequest {
  apiKey?: ApiKeyPrincipal;
}

const BEARER = /^Bearer\s+(\S+)$/i;

export function parseBearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = BEARER.exec(value.trim());
  return match?.[1] ?? null;
}

/** P2-14: authenticate `Authorization: Bearer dpk_live_...` requests. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const token = parseBearer(request.headers.authorization);
    if (!token) throw new ApiError('UNAUTHENTICATED', 'An API key is required.');

    const principal = await this.apiKeys.verifyToken(token);
    if (!principal) throw new ApiError('UNAUTHENTICATED', 'The API key is invalid.');
    request.apiKey = principal;
    return true;
  }
}

export const REQUIRED_SCOPES = 'auth:required-scopes';

export const RequireScopes = (...scopes: ApiKeyScope[]): CustomDecorator<string> =>
  SetMetadata(REQUIRED_SCOPES, scopes);

/** P2-14: enforce the scopes declared with `@RequireScopes(...)`. */
@Injectable()
export class ApiKeyScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(REQUIRED_SCOPES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    if (!request.apiKey) throw new ApiError('UNAUTHENTICATED', 'An API key is required.');
    const missing = required.filter((scope) => !request.apiKey!.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ApiError('FORBIDDEN', `The API key is missing the ${missing.join(', ')} scope.`);
    }
    return true;
  }
}
