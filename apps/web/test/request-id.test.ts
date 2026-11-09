import { describe, expect, it } from 'vitest';
import {
  REQUEST_ID_PATTERN,
  generateRequestId,
  getRequestId,
  resolveRequestId,
} from '../server/utils/request-id';

describe('request ids', () => {
  it('generates ids that satisfy the envelope pattern', () => {
    const id = generateRequestId();
    expect(id).toMatch(REQUEST_ID_PATTERN);
    expect(generateRequestId()).not.toBe(id);
  });

  it('reuses a valid incoming id and replaces an invalid one', () => {
    expect(resolveRequestId('req_abcdef12')).toBe('req_abcdef12');
    expect(resolveRequestId('bad id!')).toMatch(REQUEST_ID_PATTERN);
    expect(resolveRequestId(undefined)).toMatch(REQUEST_ID_PATTERN);
  });

  it('caches the id on the event context', () => {
    const event = { context: {} as { requestId?: string } };
    const first = getRequestId(event);
    expect(getRequestId(event)).toBe(first);
  });
});
