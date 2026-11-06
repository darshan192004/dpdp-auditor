import { z } from 'zod';

const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const isoTimestampSchema = z.string().regex(ISO_UTC_MILLIS, {
  message: 'Must be an ISO 8601 UTC timestamp with milliseconds (e.g. 2026-11-04T09:31:22.481Z).',
});
