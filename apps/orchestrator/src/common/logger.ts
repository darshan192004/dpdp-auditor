import { redact } from '@dpdpa/observability';
import type { LoggerService } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { resolveRequestId } from './request-id.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Bound once per request in `onRequest` so the access log and the error envelope share one id. */
    requestId?: string;
  }
}

const ORG_ID_PATTERN = /^org_[A-Za-z0-9_-]{1,64}$/;
const SCAN_ID_PATTERN = /^scn_[A-Za-z0-9_-]{1,64}$/;

/**
 * Two redaction layers (observability.md): pino's `redact` for known paths,
 * and the P0-16 `redact()` key pattern applied to every object log argument
 * via the `logMethod` hook — so any caller gets the allowlist automatically.
 */
export const loggerOptions: LoggerOptions = {
  level: 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.api_key',
      '*.email',
      '*.ssn',
    ],
    censor: '[REDACTED]',
  },
  hooks: {
    logMethod(args, method) {
      const first = args[0];
      if (first instanceof Error) {
        // redact() deep-clones and would flatten an Error to {}; serialize first.
        args[0] = { err: pino.stdSerializers.err(first) };
      } else if (typeof first === 'object' && first !== null) {
        const serialized = redact(first) as Record<string, unknown>;
        if ('err' in first && first.err instanceof Error) {
          serialized.err = pino.stdSerializers.err(first.err);
        }
        args[0] = serialized;
      }
      method.apply(this, args);
    },
  },
};

export function createLogger(stream?: DestinationStream): Logger {
  return stream ? pino(loggerOptions, stream) : pino(loggerOptions);
}

/** The process-wide Pino logger (JSON on stdout). */
export const logger = createLogger();

/** Bind the shared request id before routing so every log line and the error envelope agree. */
export function attachRequestContext(request: FastifyRequest): void {
  request.requestId = resolveRequestId(request.headers);
}

/**
 * Access-log fields per the observability.md log schema: `route` is the route
 * pattern (never the raw URL with query PII); `orgId`/`scanId` only when they
 * match their public-id shapes, so arbitrary header/param junk never reaches logs.
 */
export function requestLogFields(
  request: FastifyRequest,
  statusCode: number,
): Record<string, unknown> {
  const orgId = request.headers['x-org-id'];
  const params = request.params as Record<string, unknown> | undefined;
  const scanId = params?.scanId;
  return {
    requestId: request.requestId ?? resolveRequestId(request.headers),
    ...(typeof orgId === 'string' && ORG_ID_PATTERN.test(orgId) ? { orgId } : {}),
    ...(typeof scanId === 'string' && SCAN_ID_PATTERN.test(scanId) ? { scanId } : {}),
    route: request.routeOptions?.url ?? 'unmatched',
    method: request.method,
    statusCode,
  };
}

/** Routes Nest's `Logger` calls (lifecycle, `Logger.*`, the exception filter) into Pino. */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly pino: Logger = logger) {}

  log(message: unknown, context?: string): void {
    this.pino.info(context ? { context } : {}, String(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.pino.error(
      { ...(context ? { context } : {}), ...(trace ? { trace } : {}) },
      String(message),
    );
  }

  warn(message: unknown, context?: string): void {
    this.pino.warn(context ? { context } : {}, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.pino.debug(context ? { context } : {}, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.pino.trace(context ? { context } : {}, String(message));
  }

  flush(): void {
    this.pino.flush();
  }
}
