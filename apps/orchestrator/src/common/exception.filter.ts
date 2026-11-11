import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_CODES, type ErrorCode, type ErrorEnvelope } from '@dpdpa/contracts';
import { ZodError } from 'zod';
import { resolveRequestId } from './request-id.js';

// First registry entry wins, so the generic code for each status is listed
// before its specific variants (NOT_FOUND before REPO_NOT_FOUND, etc.).
function codeForStatus(status: number): ErrorCode {
  for (const [code, entry] of Object.entries(ERROR_CODES)) {
    if (entry.httpStatus === status) return code as ErrorCode;
  }
  return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
}

function httpMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;
    // Only strings pass through: object responses may carry stacks/SQL.
    if (typeof message === 'string') return message;
  }
  return 'The request could not be completed.';
}

function fastifyStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const status = (exception as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : undefined;
}

@Catch()
export class ApiExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const requestId = request.requestId ?? resolveRequestId(request.headers);

    let status: number;
    let message: string;
    let details: { path: string; message: string }[] | undefined;

    if (exception instanceof ZodError) {
      status = 422;
      message = 'The request body is invalid.';
      details = exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = httpMessage(exception);
    } else {
      // Fastify-level errors (e.g. unparseable JSON) reach the filter with
      // their own statusCode. Its 4xx messages are safe; anything else is
      // treated as unknown so internals never reach the response.
      const fastifyCode = fastifyStatus(exception);
      if (fastifyCode !== undefined && fastifyCode < 500) {
        status = fastifyCode;
        message =
          exception instanceof Error && exception.message
            ? exception.message
            : 'The request could not be parsed.';
      } else {
        status = 500;
        message = 'An unexpected error occurred.';
        this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      }
    }

    const body: ErrorEnvelope = {
      error: {
        code: codeForStatus(status),
        message,
        requestId,
        ...(details ? { details } : {}),
      },
    };
    void response.status(status).send(body);
  }
}
