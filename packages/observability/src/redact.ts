/**
 * PII/secret redaction for logs and telemetry (tasks.md P0-16).
 *
 * `redact()` deep-clones its input and replaces the value of any key matching
 * {@link SENSITIVE_KEY_PATTERN} with {@link REDACTED}, preserving the
 * {@link ALLOWED_KEYS} correlation fields. The input is never mutated; nested
 * objects, arrays, Dates, and circular references are all handled.
 */

/** Replacement value for every sensitive field. */
export const REDACTED = '[REDACTED]';

/** Key names whose values must survive redaction (log correlation). */
export const ALLOWED_KEYS = ['requestId', 'orgId', 'scanId'] as const;

/** Substring match on key names, case-insensitive (P0-16 pattern, verbatim). */
export const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|authorization|cookie|api[-_]?key|email|ssn|dpk_)/i;

const allowedKeySet: ReadonlySet<string> = new Set<string>(ALLOWED_KEYS);

function transform(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    seen.set(value, copy);
    return copy;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(transform(item, seen));
    }
    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [key, entry] of Object.entries(value)) {
    if (allowedKeySet.has(key)) {
      clone[key] = entry;
    } else if (SENSITIVE_KEY_PATTERN.test(key)) {
      clone[key] = REDACTED;
    } else {
      clone[key] = transform(entry, seen);
    }
  }
  return clone;
}

/** Deep-clone `value`, redacting sensitive keys. Safe for circular structures. */
export function redact(value: unknown): unknown {
  return transform(value, new WeakMap<object, unknown>());
}
