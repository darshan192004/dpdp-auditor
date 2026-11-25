import { createError } from 'h3';
import { callOrchestrator } from '../../utils/orchestrator';
import { fetchResolvedSession } from '../../utils/session';

/**
 * Local-only identity bootstrap for full-stack verification.
 *
 * Uses the same internal identity routes and `replaceUserSession()` sealing
 * path as the GitHub callback, but with a deterministic local user and org so
 * a browser can obtain a real session without OAuth credentials. The route is
 * unreachable in production builds.
 */

const DEV_USER = {
  githubUserId: 999000001,
  email: 'local-dev@dpdpa.test',
  name: 'Local Dev',
  avatarUrl: null,
} as const;

const DEV_ORG = {
  name: 'Local Dev Org',
  slug: 'local-dev-org',
} as const;

interface UpsertedUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface DevMembership {
  orgId: string;
  status: string;
}

interface CreatedOrg {
  id: string;
}

interface CreatedSession {
  id: string;
}

export default defineEventHandler(async (event) => {
  // Use import.meta.env.PROD for runtime check to prevent build-time dead code elimination
  if (import.meta.env.PROD) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }

  const { data: user } = await callOrchestrator<{ data: UpsertedUser }>(event, {
    method: 'POST',
    path: '/internal/v1/identity/users/upsert',
    body: DEV_USER,
  });

  // buildInternalRequest() only forwards identity headers present on context.
  event.context.userId = user.id;

  const { data: me } = await callOrchestrator<{
    data: { memberships: DevMembership[] };
  }>(event, {
    method: 'GET',
    path: '/internal/v1/identity/me',
  });
  const activeOrgId =
    me.memberships.find((membership) => membership.status === 'active')?.orgId ?? null;

  const orgId =
    activeOrgId ??
    (
      await callOrchestrator<{ data: CreatedOrg }>(event, {
        method: 'POST',
        path: '/internal/v1/identity/orgs',
        body: DEV_ORG,
      })
    ).data.id;

  const { data: session } = await callOrchestrator<{ data: CreatedSession }>(event, {
    method: 'POST',
    path: '/internal/v1/identity/sessions',
    body: {
      userId: user.id,
      activeOrgId: orgId,
      userAgent: getHeader(event, 'user-agent') ?? 'local-dev-bootstrap',
    },
  });

  await replaceUserSession(event, {
    sessionId: session.id,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });

  // Fail closed if the newly minted cookie cannot be resolved by the
  // orchestrator; never leave the browser holding an unverifiable session.
  const resolved = await fetchResolvedSession(event, session.id);
  if (resolved === null) {
    await clearUserSession(event);
    throw createError({
      statusCode: 503,
      statusMessage: 'The audit service is unavailable. Try again shortly.',
    });
  }

  return { userId: user.id, orgId, sessionId: session.id };
});
