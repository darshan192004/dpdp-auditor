import type { RuleMapping, RulesPage, RuleView, RulesQuery } from '~~/shared/rules';
import { filterRules, sortRules } from '~~/shared/rules';
import { FixtureNotFoundError } from './findings';

/**
 * Contract-shaped rule fixtures (docs/api.md §7.1).
 *
 * Every control code, severity, weight, and mapping rule ID is copied from
 * `packages/rule-packs` (dpdpa-controls.yaml and mappings/*.yaml), so the
 * explorer shows the real catalog shape instead of invented examples. This is
 * a subset: it covers every section the design discusses and both scored and
 * not-scored controls.
 */

const SEMGREP = (ruleId: string, confidence: RuleMapping['confidence'], rationale: string) => ({
  scanner: 'semgrep' as const,
  ruleId,
  confidence,
  rationale,
});

const CHECKOV = (ruleId: string, confidence: RuleMapping['confidence'], rationale: string) => ({
  scanner: 'checkov' as const,
  ruleId,
  confidence,
  rationale,
});

const GITLEAKS = (ruleId: string, confidence: RuleMapping['confidence'], rationale: string) => ({
  scanner: 'gitleaks' as const,
  ruleId,
  confidence,
  rationale,
});

const SECURITY_OBLIGATION =
  'A Data Fiduciary must implement reasonable security safeguards to prevent a personal data breach.';

const FIXTURE_RULES: RuleView[] = [
  {
    code: 'DPDPA-5-NOTICE-01',
    section: '5',
    title: 'Privacy notice is present and linked at collection',
    summary:
      'The collection surface links to a privacy notice that states the purpose and categories of personal data processed.',
    obligation:
      'A Data Fiduciary must give the Data Principal a notice describing the personal data collected, the purpose, and how to exercise rights.',
    legalReference: 'DPDPA Section 5',
    severity: 'medium',
    weight: 2,
    scored: true,
    evidenceStrength: 'advisory',
    tags: ['notice', 'transparency'],
    remediation:
      'Link the privacy notice from every collection endpoint and keep the notice version referenced in code.',
    mappings: [
      SEMGREP(
        'dpdpa.generic.privacy-notice-missing',
        'advisory',
        'A collection endpoint has no notice link; the notice may be rendered by a shared layout.',
      ),
    ],
  },
  {
    code: 'DPDPA-6-CONSENT-01',
    section: '6',
    title: 'Consent is captured before personal data processing',
    summary:
      'Write paths that touch personal data depend on a recorded consent state rather than processing unconditionally.',
    obligation:
      'Processing requires the consent of the Data Principal or a specified legitimate use, requested through a clear affirmative action.',
    legalReference: 'DPDPA Section 6',
    severity: 'high',
    weight: 5,
    scored: true,
    evidenceStrength: 'inferred',
    tags: ['consent', 'collection'],
    remediation:
      'Gate collection handlers on a consent check and persist the consent artefact with a timestamp and purpose.',
    mappings: [
      SEMGREP(
        'dpdpa.python.no-consent-check',
        'inferred',
        'A write path touches personal data without a consent dependency; the runtime flow may still enforce consent elsewhere.',
      ),
      SEMGREP(
        'dpdpa.javascript.no-consent-check',
        'inferred',
        'A Node write path touches personal data without a consent dependency; the runtime flow may still enforce consent elsewhere.',
      ),
    ],
  },
  {
    code: 'DPDPA-6-WD-01',
    section: '6',
    title: 'Consent withdrawal is implemented',
    summary: 'A consent record exposes a withdrawal path that stops further processing.',
    obligation:
      'The Data Principal may withdraw consent at any time, and withdrawal must be as easy as giving consent.',
    legalReference: 'DPDPA Section 6',
    severity: 'medium',
    weight: 3,
    scored: true,
    evidenceStrength: 'inferred',
    tags: ['consent', 'withdrawal'],
    remediation:
      'Add a withdrawal endpoint that records the event and stops downstream processing for the affected purpose.',
    mappings: [
      SEMGREP(
        'dpdpa.python.consent-withdrawal-missing',
        'inferred',
        'A consent record has no withdrawal path, so withdrawal cannot be honoured.',
      ),
    ],
  },
  {
    code: 'DPDPA-8.4-ENC-01',
    section: '8(4)',
    title: 'Personal data is encrypted at rest',
    summary:
      'Storage and database resources that can hold personal data enable encryption at rest.',
    obligation: SECURITY_OBLIGATION,
    legalReference: 'DPDPA Section 8(4)',
    severity: 'high',
    weight: 5,
    scored: true,
    evidenceStrength: 'direct',
    tags: ['encryption', 'storage', 'at-rest'],
    remediation:
      'Enable default encryption with a customer-managed KMS key, restrict key administration, and verify that new resources inherit the policy.',
    mappings: [
      CHECKOV(
        'CKV_AWS_19',
        'direct',
        'CKV_AWS_19 fails when an S3 bucket has no server-side encryption configuration, which is direct evidence that data at rest is unencrypted.',
      ),
      CHECKOV(
        'CKV_AWS_145',
        'direct',
        'Default SSE-S3 is weaker than a customer-managed KMS key and does not meet the key-control expectation for personal data.',
      ),
      CHECKOV(
        'CKV_AWS_16',
        'direct',
        'An unencrypted database instance exposes stored personal data to anyone with access to the underlying storage.',
      ),
    ],
  },
  {
    code: 'DPDPA-8.4-ACCESS-01',
    section: '8(4)',
    title: 'Data stores and services are not publicly exposed',
    summary:
      'Storage, databases, and administrative interfaces are not reachable from the public internet without an access control layer.',
    obligation: SECURITY_OBLIGATION,
    legalReference: 'DPDPA Section 8(4)',
    severity: 'critical',
    weight: 8,
    scored: true,
    evidenceStrength: 'direct',
    tags: ['exposure', 'access-control'],
    remediation:
      'Remove public ACLs, restrict ingress to known networks, and require authenticated access for administrative ports.',
    mappings: [
      CHECKOV(
        'CKV_AWS_20',
        'direct',
        'A public-read ACL makes the object store readable from the internet.',
      ),
      CHECKOV(
        'CKV_AWS_17',
        'direct',
        'A publicly accessible database is reachable outside the private network.',
      ),
      CHECKOV(
        'CKV_AWS_24',
        'direct',
        'SSH open to 0.0.0.0/0 exposes administrative access to the internet.',
      ),
      CHECKOV(
        'CKV_AWS_25',
        'direct',
        'RDP open to 0.0.0.0/0 exposes remote desktop access to the internet.',
      ),
      CHECKOV(
        'CKV_AWS_79',
        'inferred',
        'IMDSv1 is a credential-theft path from an application vulnerability; the exploitability depends on the workload.',
      ),
    ],
  },
  {
    code: 'DPDPA-8.4-SECRET-01',
    section: '8(4)',
    title: 'No credentials or secrets are hardcoded',
    summary:
      'Credential material is not committed to the repository in source, config, or test fixtures.',
    obligation: SECURITY_OBLIGATION,
    legalReference: 'DPDPA Section 8(4)',
    severity: 'critical',
    weight: 8,
    scored: true,
    evidenceStrength: 'direct',
    tags: ['secrets', 'credentials'],
    remediation:
      'Revoke the exposed credential, move it to a managed secret store, and add a pre-commit secret scan.',
    mappings: [
      SEMGREP(
        'dpdpa.generic.hardcoded-credential',
        'direct',
        'A credential literal in source is readable by anyone with repository access.',
      ),
      GITLEAKS(
        'aws-access-token',
        'direct',
        'A long-lived cloud credential in source is readable by anyone with repository access.',
      ),
      GITLEAKS(
        'github-pat',
        'direct',
        'A repository access credential in source grants code access to anyone who can read the repository.',
      ),
      GITLEAKS(
        'generic-api-key',
        'direct',
        'A service credential in source can authenticate to a third-party service.',
      ),
    ],
  },
  {
    code: 'DPDPA-8.4-LOG-01',
    section: '8(4)',
    title: 'Personal data is not written to logs',
    summary:
      'Log statements do not receive request bodies, user objects, or fields that carry personal data.',
    obligation: SECURITY_OBLIGATION,
    legalReference: 'DPDPA Section 8(4)',
    severity: 'critical',
    weight: 7,
    scored: true,
    evidenceStrength: 'direct',
    tags: ['logging', 'personal-data'],
    remediation:
      'Remove personal data from log calls; log a salted hash or an internal identifier instead.',
    mappings: [
      SEMGREP(
        'dpdpa.python.pii-in-logs',
        'direct',
        'A PII-shaped value is passed to a logger, which widens access beyond the collection purpose.',
      ),
      SEMGREP(
        'dpdpa.javascript.pii-in-logs',
        'direct',
        'A request body or user object is logged, exposing personal data to log readers.',
      ),
    ],
  },
  {
    code: 'DPDPA-9-CHILD-01',
    section: '9',
    title: "Children's data processing includes verifiable consent",
    summary: 'Child-directed flows verify age and obtain verifiable parental consent.',
    obligation:
      "Processing children's data requires verifiable parental consent and must not use behavioural tracking or targeted advertising.",
    legalReference: 'DPDPA Section 9',
    severity: 'high',
    weight: 4,
    scored: true,
    evidenceStrength: 'advisory',
    tags: ['children', 'consent'],
    remediation:
      "Add an age gate and a verifiable parental consent flow before processing children's data.",
    mappings: [
      SEMGREP(
        'dpdpa.generic.children-data-no-age-gate',
        'advisory',
        'A child-directed feature lacks an age gate; applicability depends on the product audience.',
      ),
    ],
  },
  {
    code: 'DPDPA-12-ACCESS-01',
    section: '12',
    title: 'Data access and export endpoint exists',
    summary:
      'The service exposes a path for a Data Principal to request a summary of their personal data.',
    obligation:
      'A Data Principal may request a summary of the personal data processed and the identities of the Data Fiduciaries with whom it was shared.',
    legalReference: 'DPDPA Section 12',
    severity: 'medium',
    weight: 0,
    scored: false,
    evidenceStrength: 'advisory',
    tags: ['rights', 'access'],
    remediation:
      'Add an authenticated data-access endpoint that returns the stored personal data for the requesting principal.',
    mappings: [],
  },
  {
    code: 'DPDPA-13-ERASE-01',
    section: '13',
    title: 'Correction and erasure are implemented',
    summary: 'Deletion paths remove personal data rather than only setting a flag.',
    obligation:
      'A Data Principal may request correction, completion, updating, and erasure of personal data.',
    legalReference: 'DPDPA Section 13',
    severity: 'high',
    weight: 4,
    scored: true,
    evidenceStrength: 'inferred',
    tags: ['rights', 'erasure'],
    remediation:
      'Implement a hard-delete path for personal data and propagate erasure to derived stores.',
    mappings: [
      SEMGREP(
        'dpdpa.generic.hard-delete-missing',
        'inferred',
        'User deletion only sets a flag, leaving personal data in place.',
      ),
    ],
  },
  {
    code: 'DPDPA-16-XBORDER-01',
    section: '16',
    title: 'Cross-border transfer is restricted or disclosed',
    summary:
      'The codebase does not silently replicate personal data to regions outside the approved transfer basis.',
    obligation:
      'A Data Fiduciary must not transfer personal data outside India except as notified by the Central Government.',
    legalReference: 'DPDPA Section 16',
    severity: 'high',
    weight: 4,
    scored: true,
    evidenceStrength: 'inferred',
    tags: ['cross-border', 'transfer'],
    remediation:
      'Confirm the destination region and transfer basis, then pin resources and SDKs to an approved region.',
    mappings: [
      CHECKOV(
        'CKV_AWS_144',
        'inferred',
        'Cross-region replication may move personal data outside the chosen region; the destination and transfer basis need confirmation.',
      ),
      SEMGREP(
        'dpdpa.javascript.cross-border-sdk',
        'inferred',
        'A third-party SDK defaults to a region outside India, which may transfer personal data without a recorded basis.',
      ),
    ],
  },
];

export function listFixtureRules(query: RulesQuery): RulesPage {
  const matches = filterRules(FIXTURE_RULES, query);
  return {
    data: structuredClone(sortRules(matches)),
    pagination: { page: 1, pageSize: 50, totalItems: matches.length, totalPages: 1 },
  };
}

export function getFixtureRule(code: string): RuleView {
  const rule = FIXTURE_RULES.find((candidate) => candidate.code === code);
  if (rule === undefined) throw new FixtureNotFoundError('The control does not exist.');
  return structuredClone(rule);
}
