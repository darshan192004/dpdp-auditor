import { FINDING_SCANNERS, type FindingScanner } from './findings';

/**
 * Scan view model shared by the app and Nitro (docs/api.md §3.2).
 *
 * The server never recomputes a score here: this is the wire shape plus the
 * pure presentation rules from docs/design.md §5.1/§5.2, so the page and its
 * tests agree on when a section is "partial" and when coverage withholds a
 * grade.
 */

export const SCAN_STATUSES = [
  'queued',
  'cloning',
  'scanning',
  'mapping',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCANNER_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'timed_out',
  'skipped',
] as const;
export type ScannerStatus = (typeof SCANNER_STATUSES)[number];

/** Per-scanner outcome from `scan.coverage`; a missing key means "did not run". */
export type ScanCoverage = Partial<Record<FindingScanner, ScannerStatus>>;

export type ScanGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScanCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface ScanDetail {
  id: string;
  repository: { id: string; fullName: string; visibility: string };
  status: ScanStatus;
  ref: string;
  commitSha: string | null;
  score: number | null;
  grade: ScanGrade | null;
  previousScore: number | null;
  sectionScores: Record<string, number | null>;
  counts: ScanCounts;
  coverage: ScanCoverage;
  scannerVersions: Record<string, string>;
  rulePackVersion: string | null;
  scoringVersion: string | null;
  error: { code: string; message: string | null } | null;
  timestamps: {
    queuedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
  };
  links: { findings: string; events: string; report: string };
}

const SCANNER_LABELS: Record<FindingScanner, string> = {
  semgrep: 'Semgrep',
  checkov: 'Checkov',
  gitleaks: 'Gitleaks',
};

const SCANNER_STATUS_REASONS: Record<ScannerStatus, string> = {
  completed: 'completed',
  pending: 'did not run',
  running: 'was still running',
  failed: 'failed',
  timed_out: 'timed out',
  skipped: 'was skipped',
};

export type CoverageState = 'full' | 'partial';

export interface CoverageAssessment {
  state: CoverageState;
  /** Human sentence for the banner; null when coverage is full. */
  note: string | null;
}

/**
 * api.md §3.2: coverage is authoritative. Anything short of every scanner
 * completing is partial, including a scanner that never reported.
 */
export function coverageFor(coverage: ScanCoverage): CoverageAssessment {
  const incomplete = FINDING_SCANNERS.filter((scanner) => coverage[scanner] !== 'completed');
  if (incomplete.length === 0) return { state: 'full', note: null };

  const reasons = incomplete.map(
    (scanner) =>
      `${SCANNER_LABELS[scanner]} ${SCANNER_STATUS_REASONS[coverage[scanner] ?? 'pending']}`,
  );
  return { state: 'partial', note: `Coverage incomplete: ${reasons.join(', ')}.` };
}

/** docs/rules.md §2, in the order the section table uses. */
export const SECTION_LABELS: Record<string, string> = {
  '5': 'Notice',
  '6': 'Consent',
  '7': 'Legitimate uses',
  '8(4)': 'Security safeguards',
  '8(5)': 'Breach notification',
  '9': "Children's data",
  '10': 'SDF obligations',
  '12': 'Right to access',
  '13': 'Correction and erasure',
  '16': 'Cross-border transfer',
};

export type SectionStatus = 'not_assessed' | 'compliant' | 'partial' | 'non_compliant';

export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  not_assessed: 'Not assessed by code',
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
};

/** Thresholds match the worked examples in docs/design.md §5.2 (100/85/68.2). */
export function sectionStatus(score: number | null): SectionStatus {
  if (score === null) return 'not_assessed';
  if (score >= 90) return 'compliant';
  if (score >= 75) return 'partial';
  return 'non_compliant';
}

export interface ScanSectionRow {
  section: string;
  label: string;
  score: number | null;
  status: SectionStatus;
}

/**
 * Worst section first; unassessed sections sink to the bottom because they
 * carry no signal about risk. Unknown codes fall back to the raw key.
 */
export function scanSections(sectionScores: Record<string, number | null>): ScanSectionRow[] {
  return Object.entries(sectionScores)
    .map(([section, score]) => ({
      section,
      label: SECTION_LABELS[section] ?? section,
      score,
      status: sectionStatus(score),
    }))
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.section.localeCompare(b.section);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score;
    });
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface ScoreTrend {
  delta: number;
  direction: TrendDirection;
}

/** One decimal, matching the score's own precision. No previous scan → null. */
export function trendFor(
  score: number | null,
  previousScore: number | null | undefined,
): ScoreTrend | null {
  if (score === null || previousScore === null || previousScore === undefined) return null;
  const delta = Math.round((score - previousScore) * 10) / 10;
  return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

export function formatScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(1);
}

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  queued: 'Queued',
  cloning: 'Cloning',
  scanning: 'Scanning',
  mapping: 'Mapping',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** UTC, minute precision: scan timestamps are compared across machines. */
export function formatTimestamp(value: string | null): string {
  return value === null ? '—' : `${value.slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function shortCommit(sha: string | null): string {
  return sha === null ? '—' : sha.slice(0, 7);
}

/*
 * Phase 3 scan pipeline (P3-22/P3-23/P3-26…P3-29). Everything below is pure so
 * the progress view, polling composable, timeline, and BFF handlers agree on
 * one interpretation of the scan contract.
 */

export const SCAN_TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'expired'] as const;

/** The polling composable stops as soon as this is true (design §7.3). */
export function isTerminalStatus(status: ScanStatus): boolean {
  return (SCAN_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** One row of `GET /api/v1/scan/:id/events` (api.md §3.5). */
export interface ScanEvent {
  type: string;
  at: string;
  payload: unknown;
}

export function scanEventsPath(scanId: string): string {
  return `/api/v1/scan/${encodeURIComponent(scanId)}/events`;
}

export function scanCancelPath(scanId: string): string {
  return `/api/v1/scan/${encodeURIComponent(scanId)}/cancel`;
}

/** Roles allowed to start or cancel a scan (api.md §1.3: Auditor+). */
export const SCAN_WRITE_ROLES = ['owner', 'admin', 'auditor'] as const;

export function canManageScans(role: string | null | undefined): boolean {
  return (
    role !== null && role !== undefined && (SCAN_WRITE_ROLES as readonly string[]).includes(role)
  );
}

/*
 * ScanProgress: fixed stages, never a fake percentage (design §5.6).
 */

export const SCAN_STAGES = ['queued', 'cloning', 'scanning', 'mapping', 'completed'] as const;
export type ScanStage = (typeof SCAN_STAGES)[number];

export const SCAN_STAGE_LABELS: Record<ScanStage, string> = {
  queued: 'Queued',
  cloning: 'Cloning',
  scanning: 'Scanning',
  mapping: 'Mapping',
  completed: 'Completed',
};

export type StageState = 'done' | 'current' | 'pending' | 'failed';

export interface ScanStageView {
  stage: ScanStage;
  label: string;
  state: StageState;
}

/**
 * Which stage is done/current/failed. A terminal status without a start time
 * (`started: false`) failed before work began, so the queue stage carries it.
 */
export function scanStages(
  status: ScanStatus,
  options: { started?: boolean } = {},
): ScanStageView[] {
  const started = options.started ?? false;

  return SCAN_STAGES.map((stage, index) => {
    let state: StageState;
    if (status === 'completed') {
      state = 'done';
    } else if (isTerminalStatus(status)) {
      const stoppedAt = started ? 2 : 0;
      state = index < stoppedAt ? 'done' : index === stoppedAt ? 'failed' : 'pending';
    } else {
      const current = SCAN_STAGES.indexOf(status as ScanStage);
      state = index < current ? 'done' : index === current ? 'current' : 'pending';
    }
    return { stage, label: SCAN_STAGE_LABELS[stage], state };
  });
}

export const SCANNER_STATUS_LABELS: Record<ScannerStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  timed_out: 'Timed out',
  skipped: 'Skipped',
};

export interface ScannerProgressRow {
  scanner: FindingScanner;
  label: string;
  status: ScannerStatus;
  statusLabel: string;
}

/** Every scanner in catalog order; a missing coverage key means "did not run". */
export function scannerProgress(coverage: ScanCoverage): ScannerProgressRow[] {
  return FINDING_SCANNERS.map((scanner) => {
    const status = coverage[scanner] ?? 'pending';
    return {
      scanner,
      label: SCANNER_LABELS[scanner],
      status,
      statusLabel: SCANNER_STATUS_LABELS[status],
    };
  });
}

const FAILED_SCANNER_STATUSES: readonly ScannerStatus[] = ['failed', 'timed_out', 'skipped'];

/**
 * Warn as soon as a scanner fails, without waiting for the scan to finish
 * (design §5.6). Pending/running scanners are not warnings yet.
 */
export function scannerFailureNote(coverage: ScanCoverage): string | null {
  const failed = FINDING_SCANNERS.filter((scanner) =>
    FAILED_SCANNER_STATUSES.includes(coverage[scanner] ?? 'pending'),
  );
  if (failed.length === 0) return null;

  const reasons = failed.map(
    (scanner) =>
      `${SCANNER_LABELS[scanner]} ${SCANNER_STATUS_REASONS[coverage[scanner] ?? 'pending']}`,
  );
  return `Coverage will be partial: ${reasons.join(', ')}.`;
}

export interface ScanTimestamps {
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Elapsed time from start (or queue) to completion (or now); never negative. */
export function scanElapsedMs(timestamps: ScanTimestamps, nowMs: number): number {
  const start = Date.parse(timestamps.startedAt ?? timestamps.queuedAt);
  const end = timestamps.completedAt === null ? nowMs : Date.parse(timestamps.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/*
 * useScanPolling: 2 s cadence, 2/4/8 s backoff capped at 10 s, paused while the
 * tab is hidden, stopped on a terminal status (design §7.3).
 */

export const POLL_BASE_MS = 2_000;
export const POLL_MAX_MS = 10_000;

export interface PollDelayInput {
  failures: number;
  visible: boolean;
  terminal: boolean;
}

export function nextPollDelayMs({ failures, visible, terminal }: PollDelayInput): number | null {
  if (!visible || terminal) return null;
  const retries = Math.max(0, Math.floor(failures));
  return Math.min(POLL_BASE_MS * 2 ** retries, POLL_MAX_MS);
}

/*
 * ScanTimeline: event labels and payload summaries (api.md §3.5). Payloads
 * never contain file contents or secret values, so rendering them is safe.
 */

const SCAN_EVENT_LABELS: Record<string, string> = {
  queued: 'Queued',
  job_created: 'Job created',
  job_started: 'Job started',
  clone_completed: 'Clone completed',
  scanner_completed: 'Scanner completed',
  scanner_failed: 'Scanner failed',
  scanner_timed_out: 'Scanner timed out',
  scanner_skipped: 'Scanner skipped',
  findings_batch: 'Findings received',
  mapping_started: 'Mapping started',
  mapping_completed: 'Mapping completed',
  score_computed: 'Score computed',
  score_recomputed: 'Score recomputed',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function humaniseEventType(type: string): string {
  const words = type.replace(/[_-]+/g, ' ').trim();
  return words === '' ? 'Event' : words.charAt(0).toUpperCase() + words.slice(1);
}

export function scanEventLabel(type: string): string {
  return SCAN_EVENT_LABELS[type] ?? humaniseEventType(type);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scannerLabel(value: unknown): string | null {
  return typeof value === 'string' && (FINDING_SCANNERS as readonly string[]).includes(value)
    ? SCANNER_LABELS[value as FindingScanner]
    : null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Human summary of an event payload; null when there is nothing to add. */
export function scanEventDetail(event: ScanEvent): string | null {
  const payload = asRecord(event.payload);
  if (payload === null) return null;

  switch (event.type) {
    case 'scanner_completed': {
      const scanner = scannerLabel(payload.scanner);
      if (scanner === null) return null;
      const findings = numeric(payload.findings);
      if (findings === null) return scanner;
      return `${scanner} · ${findings} ${findings === 1 ? 'finding' : 'findings'}`;
    }
    case 'scanner_failed':
    case 'scanner_timed_out':
    case 'scanner_skipped':
      return scannerLabel(payload.scanner);
    case 'score_computed':
    case 'score_recomputed': {
      const score = numeric(payload.score);
      if (score === null) return null;
      const label = `Score ${score.toFixed(1)}`;
      return typeof payload.grade === 'string' ? `${label} · grade ${payload.grade}` : label;
    }
    case 'completed': {
      const score = numeric(payload.score);
      return score === null ? null : `Score ${score.toFixed(1)}`;
    }
    case 'failed':
      if (typeof payload.message === 'string' && payload.message !== '') return payload.message;
      return typeof payload.code === 'string' ? payload.code : null;
    case 'cancelled':
      return typeof payload.reason === 'string' && payload.reason !== '' ? payload.reason : null;
    case 'job_created':
      return typeof payload.jobName === 'string' ? payload.jobName : null;
    case 'job_started':
      return typeof payload.secretName === 'string' ? payload.secretName : null;
    case 'clone_completed': {
      const duration = numeric(payload.durationMs);
      return duration === null ? null : `Finished in ${formatDuration(duration)}`;
    }
    case 'findings_batch': {
      const scanner = scannerLabel(payload.scanner);
      const accepted = numeric(payload.accepted);
      const duplicates = numeric(payload.duplicates);
      if (scanner === null || accepted === null) return null;
      return duplicates === null
        ? `${scanner} · ${accepted} accepted`
        : `${scanner} · ${accepted} accepted, ${duplicates} duplicates`;
    }
    case 'queued': {
      const parts = [payload.ref, payload.profile].filter(
        (part): part is string => typeof part === 'string' && part !== '',
      );
      return parts.length === 0 ? null : parts.join(' · ');
    }
    default:
      return null;
  }
}

/*
 * ScanSubmitForm: the client mirrors the orchestrator's create-scan rules so a
 * bad request never leaves the browser (design §5.5).
 */

export const SCAN_PROFILES = ['standard', 'secrets-only'] as const;
export type ScanProfile = (typeof SCAN_PROFILES)[number];

export interface ScanSubmitInput {
  repositoryId?: string;
  githubUrl?: string;
  ref?: string;
  profile: ScanProfile;
}

export interface ScanCancelInput {
  reason?: string;
}

export class ScanInputError extends Error {
  constructor(
    message: string,
    readonly path = 'body',
  ) {
    super(message);
    this.name = 'ScanInputError';
  }
}

const SCAN_REF_PATTERN = /^(?:[A-Za-z0-9._/-]{1,255}|[0-9a-f]{40}|[0-9a-f]{64})$/;
export const GITHUB_URL_PATTERN =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ScanInputError(`${path} must be a string.`, path);
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseProfile(value: unknown): ScanProfile {
  if (value === undefined || value === null) return 'standard';
  if (typeof value !== 'string' || !(SCAN_PROFILES as readonly string[]).includes(value)) {
    throw new ScanInputError('Choose the standard or secrets-only profile.', 'profile');
  }
  return value as ScanProfile;
}

export function validateScanSubmit(raw: unknown): ScanSubmitInput {
  const body = asRecord(raw);
  if (body === null) throw new ScanInputError('The request body must be a JSON object.');

  const repositoryId = optionalString(body.repositoryId, 'repositoryId');
  const githubUrl = optionalString(body.githubUrl, 'githubUrl');
  if ((repositoryId === undefined) === (githubUrl === undefined)) {
    throw new ScanInputError('Provide exactly one of repositoryId or githubUrl.');
  }
  if (githubUrl !== undefined && !GITHUB_URL_PATTERN.test(githubUrl)) {
    throw new ScanInputError('Enter a GitHub repository URL.', 'githubUrl');
  }

  const input: ScanSubmitInput = { profile: parseProfile(body.profile) };
  if (repositoryId !== undefined) input.repositoryId = repositoryId;
  if (githubUrl !== undefined) input.githubUrl = githubUrl;

  const ref = optionalString(body.ref, 'ref');
  if (ref !== undefined) {
    if (!SCAN_REF_PATTERN.test(ref)) {
      throw new ScanInputError('Enter a valid branch, tag, or commit SHA.', 'ref');
    }
    input.ref = ref;
  }
  return input;
}

export function validateScanCancel(raw: unknown): ScanCancelInput {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ScanInputError('The request body must be a JSON object.');
  }

  const reason = (raw as Record<string, unknown>).reason;
  if (reason === undefined || reason === null) return {};
  if (typeof reason !== 'string') {
    throw new ScanInputError('The cancellation reason must be a string.', 'reason');
  }

  const trimmed = reason.trim();
  if (trimmed.length > 500) {
    throw new ScanInputError('The cancellation reason must be 500 characters or fewer.', 'reason');
  }
  return trimmed === '' ? {} : { reason: trimmed };
}

/** One key per user intent, reused across retries (api.md §1.7). */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** `POST /api/v1/scan` (api.md §3.1). */
export function scanSubmitPath(): string {
  return '/api/v1/scan';
}

/** Plan usage shown by the submit form; `limit: 0` means no cap (design §5.5). */
export interface ScanQuota {
  used: number;
  limit: number;
}

/** Quota is exhausted only when a positive cap has been reached. */
export function quotaExhausted(quota: ScanQuota | null | undefined): boolean {
  if (quota === null || quota === undefined) return false;
  return quota.limit > 0 && quota.used >= quota.limit;
}

export interface ScanSummary {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  status: ScanStatus;
  score: number | null;
  grade: ScanGrade | null;
  counts: ScanCounts;
  createdAt: string;
  completedAt: string | null;
}

export interface ScanListPage {
  items: ScanSummary[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
