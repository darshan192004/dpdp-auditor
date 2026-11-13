import { FINDING_STATUSES, type FindingStatus } from '~~/shared/findings';

/**
 * PATCH /api/v1/findings/:findingId — docs/api.md §4.2.
 *
 * The status/note contract is validated by the orchestrator on the real path;
 * the fixture path applies the same shared rules so local verification and CI
 * exercise identical semantics.
 */
interface TriageBody {
  status: FindingStatus;
  note?: string;
  externalUrl?: string;
}

function parseBody(raw: unknown): TriageBody {
  if (typeof raw !== 'object' || raw === null) {
    throw new BodyError('The request body must be a JSON object.');
  }

  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (typeof status !== 'string' || !(FINDING_STATUSES as readonly string[]).includes(status)) {
    throw new BodyError('Unknown finding status.', 'status');
  }

  const note = record.note;
  if (note !== undefined && typeof note !== 'string') {
    throw new BodyError('The note must be a string.', 'note');
  }

  const externalUrl = record.externalUrl;
  if (externalUrl !== undefined && typeof externalUrl !== 'string') {
    throw new BodyError('The ticket link must be a string.', 'externalUrl');
  }

  return {
    status: status as FindingStatus,
    ...(note === undefined ? {} : { note }),
    ...(externalUrl === undefined ? {} : { externalUrl }),
  };
}

class BodyError extends Error {
  constructor(
    message: string,
    readonly path = 'body',
  ) {
    super(message);
    this.name = 'BodyError';
  }
}

export default defineEventHandler(async (event) => {
  const findingId = getRouterParam(event, 'findingId') ?? '';

  let body: TriageBody;
  try {
    body = parseBody(await readBody(event));
  } catch (error) {
    if (error instanceof BodyError) {
      apiError(event, 400, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  if (fixturesEnabled() && useRuntimeConfig(event).orchestratorUrl === '') {
    try {
      return { data: triageFixtureFinding(findingId, body) };
    } catch (error) {
      if (error instanceof FixtureNotFoundError) {
        apiError(event, 404, 'NOT_FOUND', error.message);
      }
      if (error instanceof FixtureValidationError) {
        apiError(event, 400, 'VALIDATION_ERROR', error.message, error.details);
      }
      throw error;
    }
  }

  return callOrchestrator(event, {
    method: 'PATCH',
    path: `/internal/v1/findings/${findingId}`,
    body,
  });
});
