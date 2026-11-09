// GET /api/health — public liveness payload (plan Task 5, P1-28).
// `defineEventHandler` and `buildHealthStatus` are Nitro auto-imports.
export default defineEventHandler(() => buildHealthStatus());
