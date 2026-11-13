/**
 * Nitro puts the request id and (from Phase 2) the session identity on the H3
 * event context. Declaring them here keeps every caller typed without casts.
 */
import 'h3';
import type { ResolvedSession } from '../server/utils/session';

declare module 'h3' {
  interface H3EventContext {
    requestId?: string;
    orgId?: string;
    userId?: string;
    /** Validated session, set by `server/middleware/session.ts`. */
    session?: ResolvedSession;
  }
}
