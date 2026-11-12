/**
 * Dev/CI fixture switch. Only the literal `1` enables fixtures, and the
 * production deployment never sets the variable (see docs/operations.md).
 * The provider is a dev convenience; the real path is the orchestrator call.
 */
export { FIXTURE_ORG_ID, FIXTURE_USER_ID } from '~~/shared/fixtures';

export function fixturesEnabled(): boolean {
  return process.env.NUXT_FIXTURES === '1';
}
