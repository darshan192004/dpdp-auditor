/**
 * Finding view model shared by the app and Nitro (docs/api.md §4).
 *
 * Server entities never live here: this is the wire shape only. The app uses it
 * for props and the fixture provider uses it to stay contract-shaped.
 */

export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_STATUSES = [
  'open',
  'false_positive',
  'accepted_risk',
  'fixed',
  'reopened',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_SCANNERS = ['semgrep', 'checkov', 'gitleaks'] as const;
export type FindingScanner = (typeof FINDING_SCANNERS)[number];

export const FINDING_CONFIDENCES = ['direct', 'inferred', 'advisory'] as const;
export type FindingConfidence = (typeof FINDING_CONFIDENCES)[number];

/** docs/api.md §4.1 `sort`. `-` means descending. */
export const FINDING_SORTS = ['-severity', 'file', '-lineStart', '-createdAt'] as const;
export type FindingSort = (typeof FINDING_SORTS)[number];

export const DEFAULT_FINDING_SORT: FindingSort = '-severity';

/** Secrets never carry `redacted`; only the salted hash is returned. */
export interface FindingEvidence {
  redacted?: string;
  hash: string;
}

export interface FindingDpdpa {
  code: string;
  section: string;
  title: string;
  severity: FindingSeverity;
  rationale: string | null;
}

export interface FindingRemediation {
  summary: string;
  steps: string[];
}

/** api.md §4.1 response item, exactly as `toFindingView` emits it. */
export interface FindingView {
  id: string;
  scanId: string;
  scanner: FindingScanner;
  scannerRuleId: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status: FindingStatus;
  isNew: boolean;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  message: string;
  evidence: FindingEvidence;
  dpdpa: FindingDpdpa | null;
  remediation: FindingRemediation | null;
}

export interface FindingsFilters {
  severity: FindingSeverity[];
  scanner: FindingScanner[];
  section: string[];
  status: FindingStatus[];
  file: string;
  q: string;
  page: number;
  pageSize: number;
  sort: FindingSort;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const PAGE_SIZES = [25, 50, 100] as const;

export const DEFAULT_FINDINGS_FILTERS: FindingsFilters = {
  severity: [],
  scanner: [],
  section: [],
  status: [],
  file: '',
  q: '',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: DEFAULT_FINDING_SORT,
};

export interface FindingsPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface FindingsPage {
  data: FindingView[];
  pagination: FindingsPagination;
}

export interface TriageResult {
  id: string;
  status: FindingStatus;
  updatedAt: string;
  triage: {
    actor: string | null;
    note: string | null;
    at: string;
  };
}
