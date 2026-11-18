import type { AuditLogEntry, AuditLogListResponse } from '~~/shared/audit';

/**
 * Fixture audit trail for `GET /api/v1/audit-logs` (docs/api.md 7.4).
 *
 * Mirrors the action vocabulary the orchestrator actually writes
 * (`scan.rescored`, `finding.triaged`, ...) so the audit page, its filters,
 * and the NDJSON export all render real-shaped data when no orchestrator is
 * configured.
 */

interface AuditQueryLike {
  action?: string | string[];
  actorUserId?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const OWNER_ID = '0f000000-0000-4000-8000-000000000003';
const AUDITOR_ID = '0f000000-0000-4000-8000-000000000002';

const FIXTURE_AUDIT_ENTRIES: AuditLogEntry[] = [
  {
    id: 9,
    actor: { type: 'user', id: AUDITOR_ID, name: 'Fixture auditor' },
    action: 'finding.triaged',
    resource: { type: 'finding', id: 'fnd_01J8Z6C3D4E5F6G7H8J9K0M1' },
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { from: 'open', to: 'accepted_risk', severity: 'critical' },
    createdAt: '2026-11-12T15:41:09.114Z',
  },
  {
    id: 8,
    actor: { type: 'user', id: OWNER_ID, name: 'Ada Owner' },
    action: 'report.downloaded',
    resource: { type: 'report', id: 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2' },
    ip: '203.0.113.4',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { format: 'pdf', scanId: '0f000000-0000-4000-8000-000000000010' },
    createdAt: '2026-11-12T11:02:55.870Z',
  },
  {
    id: 7,
    actor: { type: 'user', id: OWNER_ID, name: 'Ada Owner' },
    action: 'audit.exported',
    resource: { type: 'org', id: '0f000000-0000-4000-8000-000000000001' },
    ip: '203.0.113.4',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { format: 'json', rows: 9 },
    createdAt: '2026-11-11T17:20:31.002Z',
  },
  {
    id: 6,
    actor: { type: 'user', id: AUDITOR_ID, name: 'Fixture auditor' },
    action: 'scan.rescored',
    resource: { type: 'scan', id: '0f000000-0000-4000-8000-000000000010' },
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { scoringVersion: '1.0.0', previous: 81.9, score: 82.6 },
    createdAt: '2026-11-10T14:35:12.481Z',
  },
  {
    id: 5,
    actor: { type: 'user', id: OWNER_ID, name: 'Ada Owner' },
    action: 'repo.connected',
    resource: { type: 'repository', id: 'repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3' },
    ip: '203.0.113.4',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { fullName: 'acme/payments-service', visibility: 'public' },
    createdAt: '2026-11-10T14:30:44.119Z',
  },
  {
    id: 4,
    actor: { type: 'user', id: OWNER_ID, name: 'Ada Owner' },
    action: 'member.invited',
    resource: { type: 'member', id: 'inv_01J8Z3K4M5N6P7Q8R9S0T1U2V9' },
    ip: '203.0.113.4',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { email: 'auditor@example.test', role: 'auditor' },
    createdAt: '2026-11-09T09:12:03.664Z',
  },
  {
    id: 3,
    actor: { type: 'user', id: OWNER_ID, name: 'Ada Owner' },
    action: 'api_key.created',
    resource: { type: 'api_key', id: 'key_01J8Z3K4M5N6P7Q8R9S0T1U2V5' },
    ip: '203.0.113.4',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { name: 'ci-reader', scopes: ['scan:read'] },
    createdAt: '2026-11-08T16:44:50.310Z',
  },
  {
    id: 2,
    actor: { type: 'user', id: AUDITOR_ID, name: 'Fixture auditor' },
    action: 'auth.login',
    resource: { type: 'session', id: null },
    ip: '203.0.113.10',
    userAgent: 'Mozilla/5.0 (fixture)',
    metadata: { method: 'github' },
    createdAt: '2026-11-08T16:40:02.005Z',
  },
  {
    id: 1,
    actor: { type: 'system', id: null, name: 'system' },
    action: 'org.created',
    resource: { type: 'org', id: '0f000000-0000-4000-8000-000000000001' },
    ip: null,
    userAgent: null,
    metadata: { slug: 'acme-payments', dataRegion: 'in' },
    createdAt: '2026-11-08T16:39:11.774Z',
  },
];

/**
 * Filters, paginates, and orders the fixture trail newest-first. Honours the
 * same query contract as `parseAuditLogQuery` so the page's filter controls
 * visibly change the results in fixture mode.
 */
export function fixtureAuditLogList(query: AuditQueryLike): AuditLogListResponse {
  const action = first(query.action) ?? '';
  const actorUserId = first(query.actorUserId) ?? '';
  const from = first(query.from) ?? '';
  const to = first(query.to) ?? '';

  let rows = [...FIXTURE_AUDIT_ENTRIES].sort((a, b) => b.id - a.id);
  if (action) rows = rows.filter((row) => row.action === action);
  if (actorUserId) rows = rows.filter((row) => row.actor.id === actorUserId);
  if (from) rows = rows.filter((row) => Date.parse(row.createdAt) >= Date.parse(from));
  if (to) rows = rows.filter((row) => Date.parse(row.createdAt) <= Date.parse(to));

  const pageSize = Math.min(Math.max(Number(first(query.pageSize)) || 50, 1), 100);
  const totalPages = Math.max(Math.ceil(rows.length / pageSize), 1);
  const page = Math.min(Math.max(Number(first(query.page)) || 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    data: rows.slice(start, start + pageSize),
    pagination: { page, pageSize, totalItems: rows.length, totalPages },
  };
}

/** Every fixture entry as NDJSON for the export endpoint. */
export function fixtureAuditLogNdjson(query: AuditQueryLike): string {
  return fixtureAuditLogList({ ...query, page: '1', pageSize: '100' })
    .data.map((entry) => JSON.stringify(entry))
    .join('\n');
}
