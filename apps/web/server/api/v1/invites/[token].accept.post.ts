/**
 * POST /api/v1/invites/:token/accept — docs/api.md P2-22.
 *
 * Accept an invitation using the token. Requires the user to be signed in,
 * and their email must match the invited address.
 */
export default defineEventHandler(async (event) => {
  requireSession(event);
  const token = getRouterParam(event, 'token');

  if (!token) {
    apiError(event, 422, 'VALIDATION_ERROR', 'Invitation token is required.');
  }

  return callOrchestrator(event, {
    method: 'POST',
    path: `/internal/v1/invites/${token}/accept`,
  });
});
