import {
  DEFAULT_FINDING_SORT,
  DEFAULT_FINDINGS_FILTERS,
  DEFAULT_PAGE_SIZE,
  FINDING_SCANNERS,
  FINDING_SEVERITIES,
  FINDING_SORTS,
  FINDING_STATUSES,
  MAX_PAGE_SIZE,
  type FindingScanner,
  type FindingSeverity,
  type FindingSort,
  type FindingStatus,
  type FindingsFilters,
} from './findings';

/**
 * URL state for the findings workbench (docs/design.md §7.4).
 *
 * The query string is the source of truth so a DPO can share a filtered view.
 * Everything is validated here: unknown values are dropped, never forwarded.
 * Shared by the page and the Nitro route so the wire query is parsed once.
 */

type QueryInput = Record<string, unknown>;

function toArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] {
  const permitted = new Set<string>(allowed);
  return unique(toArray(value).filter((item): item is T => permitted.has(item))).slice(0, max);
}

function text(value: unknown, max: number): string {
  return (toArray(value)[0] ?? '').trim().slice(0, max);
}

function positiveInt(value: unknown, fallback: number): number {
  const raw = toArray(value)[0];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function parseFindingsQuery(query: QueryInput): FindingsFilters {
  const pageSize = positiveInt(query.pageSize, DEFAULT_PAGE_SIZE);
  const sort = toArray(query.sort)[0];

  return {
    severity: enumArray<FindingSeverity>(query.severity, FINDING_SEVERITIES, 5),
    scanner: enumArray<FindingScanner>(query.scanner, FINDING_SCANNERS, 3),
    section: unique(
      toArray(query.section)
        .map((item) => item.trim().slice(0, 16))
        .filter((item) => item !== ''),
    ).slice(0, 16),
    status: enumArray<FindingStatus>(query.status, FINDING_STATUSES, 5),
    file: text(query.file, 512),
    q: text(query.q, 200),
    page: positiveInt(query.page, 1),
    pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
    sort: FINDING_SORTS.includes(sort as FindingSort)
      ? (sort as FindingSort)
      : DEFAULT_FINDING_SORT,
  };
}

/**
 * Omits every default so a clean view keeps a clean URL, and keeps repeatable
 * params as arrays so `router.replace` writes repeated keys.
 */
export function serialiseFindingsQuery(
  filters: FindingsFilters,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};

  if (filters.severity.length > 0) query.severity = [...filters.severity];
  if (filters.scanner.length > 0) query.scanner = [...filters.scanner];
  if (filters.section.length > 0) query.section = [...filters.section];
  if (filters.status.length > 0) query.status = [...filters.status];
  if (filters.file !== '') query.file = filters.file;
  if (filters.q !== '') query.q = filters.q;
  if (filters.page !== DEFAULT_FINDINGS_FILTERS.page) query.page = String(filters.page);
  if (filters.pageSize !== DEFAULT_FINDINGS_FILTERS.pageSize) {
    query.pageSize = String(filters.pageSize);
  }
  if (filters.sort !== DEFAULT_FINDING_SORT) query.sort = filters.sort;

  return query;
}

/** Paging and sort are not filters; they must not enable "Clear filters". */
export function hasActiveFilters(filters: FindingsFilters): boolean {
  return (
    filters.severity.length > 0 ||
    filters.scanner.length > 0 ||
    filters.section.length > 0 ||
    filters.status.length > 0 ||
    filters.file !== '' ||
    filters.q !== ''
  );
}
