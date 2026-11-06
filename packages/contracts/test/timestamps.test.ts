import { describe, expect, it } from 'vitest';
import { isoTimestampSchema } from '../src/timestamps';

describe('isoTimestampSchema', () => {
  it('accepts an ISO 8601 UTC timestamp with milliseconds', () => {
    expect(isoTimestampSchema.safeParse('2026-11-04T09:31:22.481Z').success).toBe(true);
  });

  it('rejects a timestamp without milliseconds', () => {
    expect(isoTimestampSchema.safeParse('2026-11-04T09:31:22Z').success).toBe(false);
  });

  it('rejects a non-UTC offset', () => {
    expect(isoTimestampSchema.safeParse('2026-11-04T09:31:22.481+00:00').success).toBe(false);
  });

  it('rejects a space date/time separator', () => {
    expect(isoTimestampSchema.safeParse('2026-11-04 09:31:22.481Z').success).toBe(false);
  });

  it('rejects a missing Z suffix', () => {
    expect(isoTimestampSchema.safeParse('2026-11-04T09:31:22.481').success).toBe(false);
  });

  it('rejects a non-string input', () => {
    expect(isoTimestampSchema.safeParse(1793803882481).success).toBe(false);
  });
});
