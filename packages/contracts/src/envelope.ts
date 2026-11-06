import { z } from 'zod';
import { ERROR_CODES, type ErrorCode } from './error-codes';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const errorCodeEnum = z.enum(Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeEnum,
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    requestId: z.string().regex(REQUEST_ID_PATTERN, {
      message: 'Must match the X-Request-Id format ^[A-Za-z0-9_-]{8,64}$.',
    }),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
