import { createError, getHeader, readBody } from 'h3';

import { callOrchestrator } from '../../../utils/orchestrator';
import { clientIp } from '../../../utils/rate-limit';
import { fetchResolvedSession } from '../../../utils/session';

interface PasswordLoginResult {
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  mustChangePassword: boolean;
  sessionId: string;
}

/** Manual validation: the web app deliberately has no zod dependency. */
function parseInput(raw: unknown): { email: string; password: string } {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid body');
  const { email, password } = raw as Record<string, unknown>;
  if (
    typeof email !== 'string' ||
    email.length === 0 ||
    email.length > 320 ||
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > 200
  ) {
    throw new Error('invalid body');
  }
  return { email, password };
}

/**
 * POST /api/auth/password/login — internal-pilot password sign-in.
 *
 * Delegates credential verification and rate limiting to the orchestrator,
 * mints the session through the existing fail-closed resolution path, and
 * never reveals which part of a login failed.
 */
export default defineEventHandler(async (event) => {
  let email: string;
  let password: string;
  try {
    ({ email, password } = parseInput(await readBody(event)));
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid email or password.' });
  }

  const resolvedIp = clientIp(event);
  const ip = resolvedIp === 'unknown' ? null : resolvedIp;

  let data: PasswordLoginResult;
  try {
    const result = await callOrchestrator<{ data: PasswordLoginResult }>(event, {
      method: 'POST',
      path: '/internal/v1/identity/password/login',
      body: {
        email,
        password,
        userAgent: getHeader(event, 'user-agent') ?? 'password-login',
        ip,
      },
    });
    data = result.data;
  } catch {
    // Mask auth failures and upstream rate-limit-store failures alike.
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' });
  }

  const sessionUser = {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    avatarUrl: data.user.avatarUrl ?? null,
    mustChangePassword: data.mustChangePassword,
  };
  await replaceUserSession(event, { sessionId: data.sessionId, user: sessionUser });

  // Fail closed if the newly minted cookie cannot be resolved.
  if ((await fetchResolvedSession(event, data.sessionId)) === null) {
    await clearUserSession(event);
    throw createError({
      statusCode: 503,
      statusMessage: 'The audit service is unavailable. Try again shortly.',
    });
  }

  return { ok: true, mustChangePassword: data.mustChangePassword };
});
