/** Deterministic identities for the dev/CI fixture session (never production). */
export const FIXTURE_ORG_ID = '0f000000-0000-4000-8000-000000000001';
export const FIXTURE_USER_ID = '0f000000-0000-4000-8000-000000000002';

/** A completed scan where one scanner timed out: the grade is withheld. */
export const FIXTURE_PARTIAL_SCAN_ID = '0f000000-0000-4000-8000-000000000011';

/** A scan still in flight, so the progress view and polling have a subject. */
export const FIXTURE_RUNNING_SCAN_ID = '0f000000-0000-4000-8000-000000000012';

/** Synthetic scoring-v2 walkthrough identities (never pilot data). */
export const FIXTURE_V2_SCAN_ID = '0f000000-0000-4000-8000-0000000000a1';
export const FIXTURE_V2_REPO_ID = '0f000000-0000-4000-8000-0000000000a2';

/**
 * Fixture-only role override. The default session stays read-only (auditor);
 * `?fixtureRole=owner|admin` exposes the owner/admin write control for the
 * live walkthrough. Production never calls this helper.
 */
export function fixtureRoleFor(requested: string | null | undefined): string {
  return requested === 'owner' || requested === 'admin' ? requested : 'auditor';
}

export const PARTIAL_FINDING_COUNTS = { critical: 1, high: 2, medium: 3, low: 1, info: 0 } as const;
