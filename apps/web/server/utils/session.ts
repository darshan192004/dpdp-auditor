import type { H3Event } from 'h3';
import { $fetch } from 'ofetch';
import type { MeMembership, MeUser } from '~~/shared/auth';
import { apiError } from './api-error';
import { buildInternalRequest, orchestratorConfig } from './orchestrator';

/** Must match `runtimeConfig.session.name` in `nuxt.config.ts`. */
export const SESSION_COOKIE_NAME = 'dpdpa_session';

/** Orchestrator view of a validated session (api.md §8/§10). */
export interface ResolvedSession {
  session: {
    id: string;
    userId: string;
    activeOrgId: string | null;
    absoluteExpiresAt: string;
  };
  user: MeUser;
  memberships: (MeMembership & { status: string })[];
  featureFlags: Record<string, boolean>;
}

/** The org a session acts in: explicit selection, else the first membership. */
export function sessionIdentity(resolved: Pick<ResolvedSession, 'session' | 'memberships'>): {
  userId: string;
  orgId: string | null;
} {
  return {
    userId: resolved.session.userId,
    orgId: resolved.session.activeOrgId ?? resolved.memberships[0]?.orgId ?? null,
  };
}

export interface RequestSession {
  resolved: ResolvedSession;
  userId: string;
}

export interface RequestIdentity extends RequestSession {
  orgId: string;
  role: string;
}

/**
 * Authenticated request guard for routes that only need the user (onboarding
 * creates the first organisation, so no org is required yet).
 */
export function requireSession(event: H3Event): RequestSession {
  const resolved = event.context.session as ResolvedSession | undefined;
  if (!resolved) apiError(event, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return { resolved, userId: resolved.session.userId };
}

/**
 * Tenant guard: the session must resolve to an active membership. Missing and
 * suspended memberships answer the same way so cross-tenant probing learns
 * nothing (security.md §3.4).
 */
export function requireIdentity(event: H3Event): RequestIdentity {
  const session = requireSession(event);
  const { orgId } = sessionIdentity(session.resolved);
  if (orgId === null) {
    apiError(event, 403, 'FORBIDDEN', 'Create or join an organisation first.');
  }

  const membership = session.resolved.memberships.find((entry) => entry.orgId === orgId);
  if (!membership || membership.status !== 'active') {
    apiError(event, 403, 'FORBIDDEN', 'Your membership is not active.');
  }
  return { ...session, orgId, role: membership.role };
}

/** Role guard on top of `requireIdentity` (security.md §3.4). */
export function requireRole(event: H3Event, allowed: readonly string[]): RequestIdentity {
  const identity = requireIdentity(event);
  if (!allowed.includes(identity.role)) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }
  return identity;
}

/**
 * Resolves the sealed cookie's session id against the orchestrator, which owns
 * revocation, the 8 h absolute expiry, and the 30 min idle timeout.
 *
 * Returns `null` for a missing/expired/revoked session so the caller can fall
 * back to the signed-out experience. Transport failures also fail closed: an
 * unverifiable session must never be treated as authenticated.
 */
export async function fetchResolvedSession(
  event: H3Event,
  sessionId: string,
): Promise<ResolvedSession | null> {
  const config = orchestratorConfig(event);
  if (!config.url || !config.hmacKey || !config.internalKey) return null;

  const path = `/internal/v1/identity/sessions/${encodeURIComponent(sessionId)}`;
  const request = buildInternalRequest(event, { method: 'GET', path }, config);

  try {
    const response = await $fetch.raw<{ data: ResolvedSession }>(`${config.url}${path}`, {
      method: 'GET',
      headers: request.headers,
      signal: AbortSignal.timeout(15_000),
    });
    return response._data?.data ?? null;
  } catch {
    return null;
  }
}
