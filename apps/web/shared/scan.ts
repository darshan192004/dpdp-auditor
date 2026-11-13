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
