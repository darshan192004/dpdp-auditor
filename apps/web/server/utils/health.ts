import appPackage from '../../package.json';
import type { HealthStatus } from '../../app/types/health';

/**
 * Builds the `GET /api/health` payload (plan Task 5 / tasks.md §4.3).
 * Inputs are injectable so the contract is testable without a running server.
 * Only the version is exposed — never env values or build metadata.
 */
export function buildHealthStatus(
  now: Date = new Date(),
  uptimeSeconds: number = process.uptime(),
): HealthStatus {
  return {
    status: 'ok',
    version: appPackage.version,
    uptimeSeconds: Math.round(uptimeSeconds),
    timestamp: now.toISOString(),
  };
}
