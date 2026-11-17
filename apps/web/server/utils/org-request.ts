import type { H3Event } from 'h3';
import { OrgInputError } from '~~/shared/org';
import { apiError } from './api-error';
import { fixturesEnabled } from './fixtures/guard';

/**
 * Fixtures answer only when explicitly enabled *and* no orchestrator is
 * configured, so a stray flag in a deployed environment still talks to the
 * real service (same rule as the other BFF handlers).
 */
export function fixturesAnswer(event: H3Event): boolean {
  return fixturesEnabled() && useRuntimeConfig(event).orchestratorUrl === '';
}

/** Maps a shared org-contract validation failure to the api.md §1.4 envelope. */
export function rethrowOrgInput(event: H3Event, error: unknown): never {
  if (error instanceof OrgInputError) {
    apiError(event, 422, 'VALIDATION_ERROR', error.message, [
      { path: error.path, message: error.message },
    ]);
  }
  throw error;
}
