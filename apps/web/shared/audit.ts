/**
 * Audit-log contract shared by the BFF handlers, the audit page, and their
 * tests (docs/api.md §7.4). Pure so validation rules can be unit-tested without
 * mounting a handler.
 */

/** Actor in an audit log entry (api.md §7.4). */
export interface AuditActor {
  type: string;
  id: string | null;
  name: string | null;
}

/** Resource in an audit log entry (api.md §7.4). */
export interface AuditResource {
  type: string;
  id: string | null;
}

/** Single audit log entry (api.md §7.4). */
export interface AuditLogEntry {
  id: number;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** List response for audit logs (api.md §7.4). */
export interface AuditLogListResponse {
  data: AuditLogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** Query parameters for audit log list (api.md §7.4). */
export interface AuditLogQuery {
  action?: string | null;
  actionContains?: string | null;
  actorUserId?: string | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
}

/** Export query parameters (api.md §7.4). */
export interface AuditLogExportQuery {
  action?: string | null;
  actorUserId?: string | null;
  from?: string | null;
  to?: string | null;
  format: string;
}

/** Truncation record for export (api.md §7.4). */
export interface AuditExportTruncation {
  truncated: true;
  nextFrom: string;
}

/** Validation failure carrying the offending field for the error envelope. */
export class AuditQueryError extends Error {
  constructor(
    message: string,
    readonly path = 'query',
  ) {
    super(message);
    this.name = 'AuditQueryError';
  }
}

export const AUDIT_PAGE_SIZE_MIN = 1;
export const AUDIT_PAGE_SIZE_MAX = 100;
export const AUDIT_PAGE_SIZE_DEFAULT = 50;

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AuditQueryError('The query must be an object.');
  }
  return raw as Record<string, unknown>;
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AuditQueryError(`The ${key} must be a string.`, key);
  }
  return value;
}

function parseInt(value: unknown, key: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AuditQueryError(`The ${key} must be an integer between ${min} and ${max}.`, key);
  }
  return parsed;
}

function parseDate(value: unknown, key: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AuditQueryError(`The ${key} must be an ISO 8601 date.`, key);
  }
  return value;
}

/** Parse and validate audit-log list query parameters. */
export function parseAuditLogQuery(raw: unknown): AuditLogQuery {
  const record = asRecord(raw);
  return {
    action: optionalString(record, 'action'),
    ...(record.actionContains === undefined
      ? {}
      : { actionContains: optionalString(record, 'actionContains') }),
    actorUserId: optionalString(record, 'actorUserId'),
    from: parseDate(record.from, 'from'),
    to: parseDate(record.to, 'to'),
    page: parseInt(record.page, 'page', AUDIT_PAGE_SIZE_MIN, 100_000, 1),
    pageSize: parseInt(
      record.pageSize,
      'pageSize',
      AUDIT_PAGE_SIZE_MIN,
      AUDIT_PAGE_SIZE_MAX,
      AUDIT_PAGE_SIZE_DEFAULT,
    ),
  };
}

/** Parse and validate audit-log export query parameters. */
export function parseAuditLogExportQuery(raw: unknown): AuditLogExportQuery {
  const record = asRecord(raw);
  const format = record.format ?? 'json';
  if (format !== 'json') {
    throw new AuditQueryError('The format must be "json".', 'format');
  }
  return {
    action: optionalString(record, 'action'),
    actorUserId: optionalString(record, 'actorUserId'),
    from: parseDate(record.from, 'from'),
    to: parseDate(record.to, 'to'),
    format,
  };
}
