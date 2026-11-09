import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyFailure =
  | 'missing_headers'
  | 'invalid_internal_key'
  | 'invalid_timestamp'
  | 'stale_timestamp'
  | 'invalid_signature';

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

export interface VerifyInput {
  secret: string;
  internalKey: string;
  providedInternalKey: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  nowSeconds: number;
  maxSkewSeconds: number;
}

export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyInternalRequest(input: VerifyInput): VerifyResult {
  if (!input.providedInternalKey || !input.timestamp || !input.signature) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!constantTimeEqual(input.internalKey, input.providedInternalKey)) {
    return { ok: false, reason: 'invalid_internal_key' };
  }
  if (!/^\d+$/.test(input.timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const timestamp = Number(input.timestamp);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(input.nowSeconds - timestamp) > input.maxSkewSeconds
  ) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  const expected = computeSignature(input.secret, input.timestamp, input.rawBody);
  if (!constantTimeEqual(expected, input.signature.toLowerCase())) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}
