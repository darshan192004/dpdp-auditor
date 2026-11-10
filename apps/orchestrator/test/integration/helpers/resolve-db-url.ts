export type DbPlan =
  { mode: 'existing'; url: string } | { mode: 'container' } | { mode: 'skip'; reason: string };

export function planDatabase(
  testDatabaseUrl: string | undefined,
  dockerAvailable: boolean,
): DbPlan {
  if (testDatabaseUrl) return { mode: 'existing', url: testDatabaseUrl };
  if (dockerAvailable) return { mode: 'container' };
  return {
    mode: 'skip',
    reason: 'TEST_DATABASE_URL is unset and the Docker daemon is unavailable',
  };
}
