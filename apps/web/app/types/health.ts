/**
 * Payload contract of `GET /api/health` — plan Task 5 (P1-28).
 * Server → client: version and liveness only, never env or build metadata.
 */
export interface HealthStatus {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}
