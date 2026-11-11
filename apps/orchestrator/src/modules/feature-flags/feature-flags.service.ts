import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';

const flagsSchema = z.record(z.string(), z.boolean());
export type FeatureFlags = z.infer<typeof flagsSchema>;

/**
 * `FEATURE_FLAGS` is a JSON object of `flag -> boolean` (env-driven at MVP,
 * no vendor lock-in — docs/tasks.md P1-33). Unset or empty means every flag
 * is off; malformed values fail fast at boot alongside the rest of the env.
 */
export function parseFeatureFlags(raw: string | undefined): FeatureFlags {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid feature flags configuration: FEATURE_FLAGS is not valid JSON');
  }
  const result = flagsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      'Invalid feature flags configuration: FEATURE_FLAGS must be a JSON object of string -> boolean',
    );
  }
  return result.data;
}

/** Read-only view over the boot-time flag map; consumed by controllers (api.md §6 /me). */
@Injectable()
export class FeatureFlagsService {
  private readonly flags: FeatureFlags;

  constructor(@Inject(ENV) env: Env) {
    this.flags = parseFeatureFlags(env.FEATURE_FLAGS);
  }

  isEnabled(flag: string, fallback = false): boolean {
    return this.flags[flag] ?? fallback;
  }

  all(): FeatureFlags {
    return { ...this.flags };
  }
}
