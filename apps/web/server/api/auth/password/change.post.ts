import { createError, getHeader, readBody } from 'h3';

import { NEW_PASSWORD_MIN_LENGTH } from '~~/shared/auth';
import { callOrchestrator } from '../../../utils/orchestrator';
import { clientIp } from '../../../utils/rate-limit';
import { fetchResolvedSession } from '../../../utils/session';

/**
 * POST /api/auth/password/change — first-login rotation for seeded accounts.
 *
 * The orchestrator re-checks the current password; this route only resolves
 * the caller's session and re-seals it with the cleared rotation flag.
 */
export default defineEventHandler(async (event) => {
  const { sessionId } = await getUserSession(event);
  if (typeof sessionId !== 'string' || sessionId === '') {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' });
  }
  const resolved = await fetchResolvedSession(event, sessionId);
  if (resolved === null) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' });
  }

  const body = await readBody(event);
  const currentPassword = (body as { currentPassword?: unknown })?.currentPassword;
  const newPassword = (body as { newPassword?: unknown })?.newPassword;
  if (
    typeof currentPassword !== 'string' ||
    currentPassword.length === 0 ||
    currentPassword.length > 200 ||
    typeof newPassword !== 'string' ||
    newPassword.length < NEW_PASSWORD_MIN_LENGTH ||
    newPassword.length > 200
  ) {
    throw createError({ statusCode: 422, statusMessage: 'Invalid password.' });
  }

  const resolvedIp = clientIp(event);
  try {
    await callOrchestrator(event, {
      method: 'POST',
      path: '/internal/v1/identity/password/change',
      body: {
        userId: resolved.session.userId,
        currentPassword,
        newPassword,
        userAgent: getHeader(event, 'user-agent') ?? 'password-change',
        ip: resolvedIp === 'unknown' ? null : resolvedIp,
      },
    });
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Current password is incorrect.' });
  }

  const sessionUser = {
    id: resolved.user.id,
    name: resolved.user.name,
    email: resolved.user.email,
    avatarUrl: resolved.user.avatarUrl,
    mustChangePassword: false,
  };
  await replaceUserSession(event, { sessionId, user: sessionUser });
  return { ok: true };
});
