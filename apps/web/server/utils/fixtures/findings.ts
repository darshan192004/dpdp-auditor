import {
  DEFAULT_FINDINGS_FILTERS,
  FINDING_STATUSES,
  type FindingSeverity,
  type FindingSort,
  type FindingView,
  type FindingsFilters,
  type FindingsPage,
  type TriageResult,
} from '~~/shared/findings';
import { validateTriage } from '~~/shared/triage';
import { FIXTURE_USER_ID } from './guard';

/**
 * Contract-shaped fixture data for the findings workbench.
 *
 * Enabled only when NUXT_FIXTURES=1 (server/utils/fixtures/guard.ts). The real
 * path is the HMAC call to the orchestrator; this provider exists so the UI and
 * Playwright can run without Docker, Postgres, or Phase 2 auth.
 */

export const FIXTURE_SCAN_ID = '0f000000-0000-4000-8000-000000000010';

const hash = (seed: number): string => `sha256:${seed.toString(16).padStart(2, '0').repeat(32)}`;

const SEED: readonly FindingView[] = [
  {
    id: '0f000000-0000-4000-8000-000000000101',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.python.pii-in-logs',
    severity: 'critical',
    confidence: 'direct',
    status: 'open',
    isNew: true,
    filePath: 'services/payments/api/views.py',
    lineStart: 142,
    lineEnd: 149,
    message: 'Personal data is written to application logs.',
    evidence: {
      redacted: 'logger.info("card=****4242 email=****@example.com")',
      hash: hash(1),
    },
    dpdpa: {
      code: 'DPDPA-8.4-LOG-01',
      section: '8(4)',
      title: 'Personal data is not written to logs',
      severity: 'critical',
      rationale:
        'Logging personal data widens access beyond the purpose for which it was collected and fails the safeguards obligation.',
    },
    remediation: {
      summary: 'Remove the log statement or replace the value with a non-reversible token.',
      steps: [
        'Delete the PII fields from the log call.',
        'If correlation is required, log a salted hash of the identifier.',
        'Add a lint rule to prevent regressions.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000102',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_20',
    severity: 'critical',
    confidence: 'direct',
    status: 'open',
    isNew: true,
    filePath: 'infra/s3.tf',
    lineStart: 12,
    lineEnd: 24,
    message: 'S3 bucket allows public read access.',
    evidence: { redacted: 'acl = "public-read"', hash: hash(2) },
    dpdpa: {
      code: 'DPDPA-8.4-ACCESS-01',
      section: '8(4)',
      title: 'Data stores and services are not publicly exposed',
      severity: 'critical',
      rationale:
        'Public storage exposes personal data to anyone with the object URL, which no consent or notice can justify.',
    },
    remediation: {
      summary: 'Set the bucket ACL to private and enable public access blocking.',
      steps: [
        'Remove `acl = "public-read"` from the bucket resource.',
        'Enable `block_public_acls` and `block_public_policy`.',
        'Serve assets through a signed URL instead.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000103',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'gitleaks',
    scannerRuleId: 'aws-access-token',
    severity: 'critical',
    confidence: 'direct',
    status: 'reopened',
    isNew: false,
    filePath: 'services/payments/config/settings.py',
    lineStart: 8,
    lineEnd: 8,
    message: 'AWS access key detected in source.',
    evidence: { hash: hash(3) },
    dpdpa: {
      code: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      title: 'No credentials or secrets are hardcoded',
      severity: 'critical',
      rationale:
        'A committed key gives anyone with repository access the same reach as the service, including the personal data it can read.',
    },
    remediation: {
      summary: 'Rotate the key, remove it from history, and load it from the secret store.',
      steps: [
        'Revoke the exposed key in IAM.',
        'Purge it from git history and force-push the cleaned branch.',
        'Read the credential from the platform secret manager at runtime.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000104',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_23',
    severity: 'high',
    confidence: 'inferred',
    status: 'open',
    isNew: true,
    filePath: 'infra/rds.tf',
    lineStart: 30,
    lineEnd: 48,
    message: 'Database snapshot is not encrypted at rest.',
    evidence: { redacted: 'storage_encrypted = false', hash: hash(4) },
    dpdpa: {
      code: 'DPDPA-8.4-ENC-01',
      section: '8(4)',
      title: 'Personal data is encrypted at rest',
      severity: 'high',
      rationale:
        'Unencrypted storage means a leaked volume or snapshot discloses personal data without any further failure.',
    },
    remediation: {
      summary: 'Enable storage encryption and encrypt existing snapshots.',
      steps: [
        'Set `storage_encrypted = true` on the instance.',
        'Point the instance at the organisation KMS key.',
        'Re-create unencrypted snapshots.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000105',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.generic.hard-delete-missing',
    severity: 'high',
    confidence: 'direct',
    status: 'open',
    isNew: false,
    filePath: 'services/payments/api/erasure.py',
    lineStart: 64,
    lineEnd: 72,
    message: 'Erasure handler marks the record deleted instead of removing it.',
    evidence: { redacted: 'record.is_deleted = True\nrecord.save()', hash: hash(5) },
    dpdpa: {
      code: 'DPDPA-13-ERASE-01',
      section: '13',
      title: 'Correction and erasure are implemented',
      severity: 'high',
      rationale:
        'A soft-delete flag leaves the personal data in place, so an erasure request is not actually honoured.',
    },
    remediation: {
      summary: 'Delete the personal data, or crypto-shred the key that protects it.',
      steps: [
        'Remove the row and its dependent records in one transaction.',
        'If a legal hold applies, crypto-shred instead of flagging.',
        'Cover both paths with a test that asserts the data is unreadable.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000106',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.javascript.no-consent-check',
    severity: 'high',
    confidence: 'inferred',
    status: 'false_positive',
    isNew: false,
    filePath: 'services/web/src/analytics.ts',
    lineStart: 22,
    lineEnd: 30,
    message: 'Analytics events are sent without checking the consent flag.',
    evidence: { redacted: 'track("checkout_started", payload)', hash: hash(6) },
    dpdpa: {
      code: 'DPDPA-6-CONSENT-01',
      section: '6',
      title: 'Consent is captured before personal data processing',
      severity: 'high',
      rationale:
        'Sending behavioural events before consent processes personal data without a lawful basis.',
    },
    remediation: {
      summary: 'Gate the analytics client on the stored consent decision.',
      steps: [
        'Read the consent record before initialising the client.',
        'Queue events until consent is granted, then flush.',
        'Drop the queue when consent is refused.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000107',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_144',
    severity: 'medium',
    confidence: 'inferred',
    status: 'open',
    isNew: false,
    filePath: 'infra/s3.tf',
    lineStart: 60,
    lineEnd: 72,
    message: 'Cross-region replication is disabled for a bucket holding personal data.',
    evidence: { redacted: 'replication_configuration { ... }', hash: hash(7) },
    dpdpa: {
      code: 'DPDPA-16-XBORDER-01',
      section: '16',
      title: 'Cross-border transfer is restricted or disclosed',
      severity: 'medium',
      rationale:
        'Replication moves personal data to another region; without a recorded basis the transfer cannot be defended.',
    },
    remediation: {
      summary: 'Either disable replication or document the transfer basis.',
      steps: [
        'Confirm whether the bucket holds personal data.',
        'Record the transfer basis in the RoPA.',
        'Restrict replication to approved regions.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000108',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.generic.unbounded-retention',
    severity: 'medium',
    confidence: 'advisory',
    status: 'open',
    isNew: true,
    filePath: 'services/payments/jobs/cleanup.py',
    lineStart: 18,
    lineEnd: 26,
    message: 'Retention job hard-codes a 30-day window instead of the organisation policy.',
    evidence: { redacted: 'CUTOFF_DAYS = 30', hash: hash(8) },
    dpdpa: {
      code: 'DPDPA-8.4-RET-01',
      section: '8(4)',
      title: 'Retention limits are enforced in code',
      severity: 'medium',
      rationale:
        'A hard-coded window silently diverges from the retention policy recorded for the organisation.',
    },
    remediation: {
      summary: 'Read the retention window from configuration.',
      steps: [
        'Load `retentionDays` from the organisation settings.',
        'Fail the job closed when the value is missing.',
        'Alert when the job deletes zero rows for a week.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000109',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_24',
    severity: 'medium',
    confidence: 'direct',
    status: 'accepted_risk',
    isNew: false,
    filePath: 'infra/network.tf',
    lineStart: 14,
    lineEnd: 28,
    message: 'Security group allows public ingress to the payments database.',
    evidence: { redacted: 'cidr_blocks = ["0.0.0.0/0"]', hash: hash(9) },
    dpdpa: {
      code: 'DPDPA-8.4-ACCESS-01',
      section: '8(4)',
      title: 'Data stores and services are not publicly exposed',
      severity: 'critical',
      rationale:
        'A database reachable from the internet is exposed to credential-stuffing and scanner traffic that no access control can fully absorb.',
    },
    remediation: {
      summary: 'Restrict ingress to the application subnet or a VPN range.',
      steps: [
        'Replace the open CIDR with the application subnet.',
        'Move administrative access behind the bastion or VPN.',
        'Alert on any security group that opens a database port to the internet.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000110',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_18',
    severity: 'medium',
    confidence: 'direct',
    status: 'fixed',
    isNew: false,
    filePath: 'infra/s3.tf',
    lineStart: 88,
    lineEnd: 96,
    message: 'Access logging is disabled for a bucket holding personal data.',
    evidence: { redacted: 'logging { ... }', hash: hash(10) },
    dpdpa: {
      code: 'DPDPA-8.4-MON-01',
      section: '8(4)',
      title: 'Access and audit logging is enabled',
      severity: 'medium',
      rationale:
        'Without access logs a breach cannot be scoped, so the notification duty cannot be met.',
    },
    remediation: {
      summary: 'Enable server access logging to the audit bucket.',
      steps: [
        'Add a `logging` block pointing at the audit bucket.',
        'Grant the logging service principal write access.',
        'Set a lifecycle rule that matches the audit retention policy.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000111',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'gitleaks',
    scannerRuleId: 'generic-api-key',
    severity: 'low',
    confidence: 'direct',
    status: 'false_positive',
    isNew: false,
    filePath: 'services/web/src/__tests__/fixtures.ts',
    lineStart: 14,
    lineEnd: 14,
    message: 'Generic API key detected in a test fixture.',
    evidence: { hash: hash(11) },
    dpdpa: {
      code: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      title: 'No credentials or secrets are hardcoded',
      severity: 'low',
      rationale:
        'Test doubles still leak real keys when a developer pastes a working credential into a fixture.',
    },
    remediation: {
      summary: 'Replace the value with an obviously fake, non-functional token.',
      steps: [
        'Use `test_` prefixed placeholders in fixtures.',
        'Add the fixture path to the scanner allow-list.',
        'Keep the rule enabled for production paths.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000112',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.generic.privacy-notice-missing',
    severity: 'low',
    confidence: 'advisory',
    status: 'open',
    isNew: true,
    filePath: 'services/web/src/components/SignupForm.tsx',
    lineStart: 9,
    lineEnd: 9,
    message: 'The signup form collects personal data without linking the privacy notice.',
    evidence: { redacted: '<input type="email" name="email" required />', hash: hash(12) },
    dpdpa: {
      code: 'DPDPA-5-NOTICE-01',
      section: '5',
      title: 'Privacy notice is present and linked at collection',
      severity: 'medium',
      rationale:
        'A notice that is not reachable at the point of collection does not inform the data principal when their data is taken.',
    },
    remediation: {
      summary: 'Link the published privacy notice beside the submit button.',
      steps: [
        'Read the notice URL from the organisation profile.',
        'Render the link inside the form, not only in the footer.',
        'Fail the build when the URL is unset.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000113',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_145',
    severity: 'low',
    confidence: 'inferred',
    status: 'open',
    isNew: false,
    filePath: 'infra/kms.tf',
    lineStart: 20,
    lineEnd: 35,
    message: 'KMS key rotation is disabled.',
    evidence: { redacted: 'enable_key_rotation = false', hash: hash(13) },
    dpdpa: {
      code: 'DPDPA-8.4-ENC-01',
      section: '8(4)',
      title: 'Personal data is encrypted at rest',
      severity: 'low',
      rationale:
        'Long-lived keys widen the window in which a single key compromise exposes personal data.',
    },
    remediation: {
      summary: 'Enable annual automatic rotation.',
      steps: [
        'Set `enable_key_rotation = true`.',
        'Confirm the application reads the key alias, not the key id.',
        'Record the change in the security log.',
      ],
    },
  },
  {
    id: '0f000000-0000-4000-8000-000000000114',
    scanId: FIXTURE_SCAN_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.generic.children-data-no-age-gate',
    severity: 'info',
    confidence: 'advisory',
    status: 'open',
    isNew: true,
    filePath: 'services/payments/api/signup.py',
    lineStart: 7,
    lineEnd: 7,
    message: 'Date of birth is collected without an age gate or parental consent check.',
    evidence: { redacted: 'dob = request.json["dob"]', hash: hash(14) },
    dpdpa: {
      code: 'DPDPA-9-CHILD-01',
      section: '9',
      title: "Children's data processing includes verifiable consent",
      severity: 'high',
      rationale:
        'Processing a child’s data without verifiable parental consent is prohibited regardless of the notice given to the parent.',
    },
    remediation: {
      summary: 'Gate the signup flow on age and record the parental consent decision.',
      steps: [
        'Derive age from the date of birth before creating the account.',
        'Route under-18 signups through the parental consent flow.',
        'Store the consent artifact with the account.',
      ],
    },
  },
];

export const FIXTURE_FINDINGS = SEED;

let state: FindingView[] = structuredClone([...SEED]);

export function resetFixtureState(): void {
  state = structuredClone([...SEED]);
}

export class FixtureNotFoundError extends Error {
  constructor(message = 'The resource does not exist.') {
    super(message);
    this.name = 'FixtureNotFoundError';
  }
}

export class FixtureValidationError extends Error {
  readonly details: { path: string; message: string }[];

  constructor(details: { path: string; message: string }[]) {
    super(details[0]?.message ?? 'The request is invalid.');
    this.name = 'FixtureValidationError';
    this.details = details;
  }
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function matches(finding: FindingView, filters: FindingsFilters): boolean {
  if (filters.severity.length > 0 && !filters.severity.includes(finding.severity)) return false;
  if (filters.scanner.length > 0 && !filters.scanner.includes(finding.scanner)) return false;
  if (
    filters.section.length > 0 &&
    (finding.dpdpa === null || !filters.section.includes(finding.dpdpa.section))
  ) {
    return false;
  }
  if (filters.status.length > 0 && !filters.status.includes(finding.status)) return false;

  const file = filters.file.toLowerCase();
  if (file !== '' && !finding.filePath.toLowerCase().startsWith(file)) return false;

  const q = filters.q.toLowerCase();
  if (
    q !== '' &&
    !finding.message.toLowerCase().includes(q) &&
    !finding.scannerRuleId.toLowerCase().includes(q)
  ) {
    return false;
  }

  return true;
}

function comparator(sort: FindingSort): (left: FindingView, right: FindingView) => number {
  switch (sort) {
    case 'file':
      return (left, right) =>
        left.filePath.localeCompare(right.filePath) ||
        left.lineStart - right.lineStart ||
        left.id.localeCompare(right.id);
    case '-lineStart':
      return (left, right) => right.lineStart - left.lineStart || left.id.localeCompare(right.id);
    case '-createdAt':
      // Fixtures are authored newest-first, so id order is creation order.
      return (left, right) => left.id.localeCompare(right.id);
    case '-severity':
    default:
      return (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        left.id.localeCompare(right.id);
  }
}

export function listFixtureFindings(
  filters: FindingsFilters = DEFAULT_FINDINGS_FILTERS,
  scanId: string = FIXTURE_SCAN_ID,
): FindingsPage {
  if (scanId !== FIXTURE_SCAN_ID) {
    throw new FixtureNotFoundError('The scan does not exist.');
  }

  const matching = state
    .filter((finding) => matches(finding, filters))
    .sort(comparator(filters.sort));
  const totalItems = matching.length;
  const start = (filters.page - 1) * filters.pageSize;

  return {
    data: matching.slice(start, start + filters.pageSize),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / filters.pageSize)),
    },
  };
}

export function triageFixtureFinding(
  findingId: string,
  input: { status: string; note?: string; externalUrl?: string },
): TriageResult {
  if (!(FINDING_STATUSES as readonly string[]).includes(input.status)) {
    throw new FixtureValidationError([{ path: 'status', message: 'Unknown finding status.' }]);
  }

  const status = input.status as FindingView['status'];
  const errors = validateTriage({
    status,
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.externalUrl === undefined ? {} : { externalUrl: input.externalUrl }),
  });
  const details = Object.entries(errors)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([path, message]) => ({ path, message }));
  if (details.length > 0) throw new FixtureValidationError(details);

  const index = state.findIndex((finding) => finding.id === findingId);
  const current = state[index];
  if (current === undefined) throw new FixtureNotFoundError('The finding does not exist.');

  const updatedAt = new Date().toISOString();
  const note = input.note === undefined ? null : input.note.trim() || null;
  state[index] = { ...current, status };

  return {
    id: current.id,
    status,
    updatedAt,
    triage: { actor: FIXTURE_USER_ID, note, at: updatedAt },
  };
}
