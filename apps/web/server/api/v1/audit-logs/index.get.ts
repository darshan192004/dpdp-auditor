import { AuditQueryError, parseAuditLogQuery } from '~~/shared/audit';
import { apiError } from '../../../utils/api-error';

/**
 * GET /api/v1/audit-logs — docs/api.md §7.4.
 * Owner and admin roles only.
 */
export default defineEventHandler(async (event) => {
  const identity = requireIdentity(event);

  if (!['owner', 'admin'].includes(identity.role)) {
    return apiError(event, 403, 'FORBIDDEN', 'Only owners and admins can read audit logs.');
  }

  const rawQuery = getQuery(event);
  let query;
  try {
    query = parseAuditLogQuery(rawQuery);
  } catch (error) {
    if (error instanceof AuditQueryError) {
      return apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  const searchParams = new URLSearchParams();
  if (query.action) searchParams.set('action', query.action);
  if (query.actorUserId) searchParams.set('actorUserId', query.actorUserId);
  if (query.from) searchParams.set('from', query.from);
  if (query.to) searchParams.set('to', query.to);
  searchParams.set('page', query.page.toString());
  searchParams.set('pageSize', query.pageSize.toString());

  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/audit/audit-logs?${searchParams.toString()}`,
  });
});
