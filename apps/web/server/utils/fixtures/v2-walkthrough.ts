import type { AssessmentSummary } from '@dpdpa/contracts';
import { FIXTURE_V2_REPO_ID, FIXTURE_V2_SCAN_ID } from '~~/shared/fixtures';
import type { FixPlan, ReadinessAttestation, ReadinessGap } from '~~/shared/readiness';
import type { ScanDetail, ScanEvent } from '~~/shared/scan';

/**
 * Synthetic scoring-v2 walkthrough fixtures. Every value is invented test
 * data: no source text, no file contents, no secrets and no canaries. These
 * exist because the legacy v1 scan fixture hides the readiness tiles, the
 * attestation verdict, the owner/admin write control and expiry state.
 */

const OWNER_ID = '0f000000-0000-4000-8000-000000000003';

const ASSESSMENT: AssessmentSummary = {
  score: 71.4,
  evidenceCoverage: 0.42,
  openGaps: 2,
  verdictCounts: {
    PASS: 3,
    FAIL: 2,
    PARTIAL: 1,
    UNKNOWN: 4,
    NOT_APPLICABLE: 1,
    ATTESTED_PASS: 1,
    ATTESTED_FAIL: 1,
  },
  unknownControls: [
    'DPDPA-8.5-BREACH-01',
    'DPDPA-9-CHILD-01',
    'DPDPA-12-ACCESS-01',
    'DPDPA-16-XBORDER-01',
  ],
  detectorStatuses: { semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' },
  gradeWithheldReason: 'insufficient_evidence',
  consentGatingRatio: 0.6,
};

export function fixtureV2Scan(): ScanDetail {
  return {
    id: FIXTURE_V2_SCAN_ID,
    repository: {
      id: FIXTURE_V2_REPO_ID,
      fullName: 'acme/synthetic-readiness',
      visibility: 'private',
    },
    status: 'completed',
    ref: 'main',
    commitSha: null,
    score: ASSESSMENT.score,
    grade: null,
    previousScore: null,
    sectionScores: {
      '5': 88.0,
      '6': 40.0,
      '7': null,
      '8(4)': 68.2,
      '8(5)': null,
      '9': null,
      '10': null,
      '12': null,
      '13': 75.0,
      '16': null,
    },
    counts: { critical: 1, high: 2, medium: 3, low: 1, info: 0, total: 7 },
    coverage: { semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' },
    scannerVersions: { semgrep: '1.95.0', checkov: '3.2.0', gitleaks: '8.21.0' },
    rulePackVersion: 'dpdpa-2026.11.0',
    scoringVersion: '2.0.0',
    assessment: structuredClone(ASSESSMENT),
    error: null,
    timestamps: {
      queuedAt: '2026-11-20T09:00:00.000Z',
      startedAt: '2026-11-20T09:00:12.000Z',
      completedAt: '2026-11-20T09:06:40.000Z',
      durationMs: 388_000,
    },
    links: {
      findings: `/api/v1/scan/${FIXTURE_V2_SCAN_ID}/findings`,
      events: `/api/v1/scan/${FIXTURE_V2_SCAN_ID}/events`,
      report: '/api/v1/report/pdf',
    },
  };
}

export const FIXTURE_V2_EVENTS: readonly ScanEvent[] = [
  { type: 'queued', at: '2026-11-20T09:00:00.000Z', payload: { ref: 'main', profile: 'standard' } },
  {
    type: 'scanner_completed',
    at: '2026-11-20T09:03:10.000Z',
    payload: { scanner: 'semgrep', findings: 4 },
  },
  { type: 'scanner_failed', at: '2026-11-20T09:05:02.000Z', payload: { scanner: 'checkov' } },
  {
    type: 'scanner_timed_out',
    at: '2026-11-20T09:06:31.000Z',
    payload: { scanner: 'gitleaks' },
  },
  {
    type: 'score_recomputed',
    at: '2026-11-20T09:06:38.000Z',
    payload: { score: 71.4, reason: 'insufficient_evidence' },
  },
];

/** Attestation verdicts are human statements: never code evidence. */
export function fixtureV2Gaps(): ReadinessGap[] {
  return [
    {
      controlCode: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      title: 'Secrets are not stored in source',
      verdict: 'FAIL',
      reasonCode: 'violation',
      evidence: [{ kind: 'violation', scanner: 'gitleaks' }],
    },
    {
      controlCode: 'DPDPA-6-CONSENTGATE-01',
      section: '6',
      title: 'Consent is gated before personal data processing',
      verdict: 'ATTESTED_FAIL',
      reasonCode: 'attested_no',
      evidence: [],
    },
  ];
}

export function fixtureV2FixPlan(): FixPlan {
  return {
    steps: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        title: 'Secrets are not stored in source',
        remedy: 'Use a managed credential store.',
      },
      {
        controlCode: 'DPDPA-6-CONSENTGATE-01',
        section: '6',
        title: 'Consent is gated before personal data processing',
        remedy: 'Record a current owner attestation with an expiry date.',
      },
    ],
  };
}

/** One current and one expired synthetic statement, both written by an owner. */
export function fixtureV2Attestations(): ReadinessAttestation[] {
  return [
    {
      id: 'att_v2_owner_01',
      repositoryId: FIXTURE_V2_REPO_ID,
      key: 'secrets.managed_store',
      answer: true,
      note: 'Synthetic: a managed credential store is used for this repository.',
      attestedBy: OWNER_ID,
      attestedAt: '2026-11-20T10:00:00.000Z',
      expiresAt: '2027-02-01T00:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
    },
    {
      id: 'att_v2_expired_01',
      repositoryId: FIXTURE_V2_REPO_ID,
      key: 'consent_gating_pre_processing',
      answer: false,
      note: 'Synthetic: the previous consent-gating statement has expired.',
      attestedBy: OWNER_ID,
      attestedAt: '2026-05-01T10:00:00.000Z',
      expiresAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    },
  ];
}
