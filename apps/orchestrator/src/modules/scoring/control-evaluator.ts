import type {
  Confidence,
  Control,
  Mapping,
  Scanner,
  Severity,
} from '../rule-pack/rule-pack.schemas.js';
import { isApplicable, type RepoFacts } from './applicability.js';
import type { FindingStatus } from './mapping.resolver.js';

export type DetectorStatus = 'completed' | 'failed' | 'timed_out' | 'skipped';

export interface EvidenceLike {
  controlCode: string | null;
  kind: 'violation' | 'missing_control' | 'weak_control' | 'positive' | 'unverified';
  scanner?: Scanner | 'inventory';
  scannerRuleId?: string;
  evidenceHash?: string | null;
  filePath?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  fingerprint?: string;
  severity: Severity;
  confidence: Confidence;
  status?: FindingStatus;
}

export type ControlEvidence = EvidenceLike;

export interface EvidenceReferenceLike {
  kind: EvidenceLike['kind'];
  scanner?: EvidenceLike['scanner'];
  scannerRuleId?: string;
  evidenceHash?: string | null;
  filePath?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  fingerprint?: string;
}

export interface ControlResultLike {
  controlCode: string;
  verdict:
    | 'PASS'
    | 'FAIL'
    | 'PARTIAL'
    | 'UNKNOWN'
    | 'NOT_APPLICABLE'
    | 'MANUAL'
    | 'ATTESTED_PASS'
    | 'ATTESTED_FAIL';
  reasonCode: string;
  confidence: Confidence | null;
  evidence: EvidenceReferenceLike[];
  rulePackVersion: string;
  scoringVersion: string;
}

export interface ControlEvaluatorInput {
  controls: readonly Control[];
  facts: RepoFacts;
  mappings: readonly Pick<Mapping, 'scanner' | 'controlCode'>[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
  findings: readonly EvidenceLike[];
  rulePackVersion: string;
  scoringVersion: string;
}

export interface ControlEvaluation {
  results: ControlResultLike[];
  byControl: Map<string, ControlResultLike>;
  verdictCounts: Record<ControlResultLike['verdict'], number>;
  unknownControls: string[];
  openGaps: number;
}

interface GroupedEvidence {
  active: EvidenceLike[];
  scanners: Set<string>;
  hasDirect: boolean;
  corroborated: boolean;
}

export function buildDetectorStatuses(
  coverage: Readonly<Record<string, string>>,
): Record<string, DetectorStatus> {
  const statuses: Record<string, DetectorStatus> = {};
  for (const [name, value] of Object.entries(coverage)) {
    if (
      value === 'completed' ||
      value === 'failed' ||
      value === 'timed_out' ||
      value === 'skipped'
    ) {
      statuses[name] = value;
    } else if (value === 'running' || value === 'pending') {
      statuses[name] = 'skipped';
    }
  }
  return statuses;
}

export function evaluateControls(input: ControlEvaluatorInput): ControlEvaluation {
  const results = input.controls.map((control) => evaluateOne(control, input));
  const byControl = new Map(results.map((result) => [result.controlCode, result]));
  const verdictCounts: ControlEvaluation['verdictCounts'] = {
    PASS: 0,
    FAIL: 0,
    PARTIAL: 0,
    UNKNOWN: 0,
    NOT_APPLICABLE: 0,
    MANUAL: 0,
    ATTESTED_PASS: 0,
    ATTESTED_FAIL: 0,
  };
  for (const result of results) verdictCounts[result.verdict] += 1;

  return {
    results,
    byControl,
    verdictCounts,
    unknownControls: results
      .filter((result) => result.verdict === 'UNKNOWN')
      .map((result) => result.controlCode),
    openGaps: results.filter((result) => result.verdict === 'FAIL').length,
  };
}

function evaluateOne(control: Control, input: ControlEvaluatorInput): ControlResultLike {
  const base = {
    controlCode: control.code,
    rulePackVersion: input.rulePackVersion,
    scoringVersion: input.scoringVersion,
  };

  if (factsUnavailable(input.facts)) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      reasonCode: 'applicability_unavailable',
      confidence: null,
      evidence: [],
    };
  }
  if (!isApplicable(control.appliesWhen, input.facts)) {
    return {
      ...base,
      verdict: 'NOT_APPLICABLE',
      reasonCode: 'applies_when_false',
      confidence: null,
      evidence: [],
    };
  }
  if (control.tags.includes('manual-only')) {
    return {
      ...base,
      verdict: 'MANUAL',
      reasonCode: 'manual_only',
      confidence: null,
      evidence: [],
    };
  }

  const grouped = groupEvidence(control.code, input.findings);
  const requiredDetectors = input.mappings
    .filter((mapping) => mapping.controlCode === control.code)
    .map((mapping) => mapping.scanner);
  const unavailable = requiredDetectors.filter(
    (detector) => input.detectorStatuses[detector] !== 'completed',
  );
  const citedFromCompleted = grouped.active.filter(
    (finding) =>
      finding.scanner !== undefined && input.detectorStatuses[finding.scanner] === 'completed',
  );
  const completedScanners = new Set(
    citedFromCompleted
      .map((finding) => finding.scanner)
      .filter((name): name is NonNullable<EvidenceLike['scanner']> => name !== undefined),
  );
  const determinativeFromCompleted =
    citedFromCompleted.some((finding) => finding.confidence === 'direct') ||
    completedScanners.size >= 2;

  if (unavailable.length > 0 && !determinativeFromCompleted) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      reasonCode: 'detector_unavailable',
      confidence: null,
      evidence: [],
    };
  }

  const violations = grouped.active.filter((finding) => finding.kind === 'violation');
  const weak = grouped.active.filter((finding) => finding.kind === 'weak_control');
  if (violations.length > 0 || weak.length > 0) {
    const candidates = [...violations, ...weak];
    const direct =
      candidates.some((finding) => finding.confidence === 'direct') || grouped.corroborated;
    const verdict = direct ? 'FAIL' : 'PARTIAL';
    return {
      ...base,
      verdict,
      reasonCode: direct ? 'cited_gap' : 'weak_evidence',
      confidence:
        grouped.corroborated || candidates.some((f) => f.confidence === 'direct')
          ? 'direct'
          : 'inferred',
      evidence: candidates.map(toEvidenceReference),
    };
  }

  const positives = grouped.active.filter((finding) => finding.kind === 'positive');
  if (positives.length > 0) {
    const direct =
      positives.some((finding) => finding.confidence === 'direct') || grouped.corroborated;
    return {
      ...base,
      verdict: direct ? 'PASS' : 'PARTIAL',
      reasonCode: direct ? 'positive_evidence' : 'weak_positive_evidence',
      confidence: grouped.corroborated ? 'direct' : (positives[0]?.confidence ?? 'inferred'),
      evidence: positives.map(toEvidenceReference),
    };
  }

  return {
    ...base,
    verdict: 'UNKNOWN',
    reasonCode: 'no_determinable_evidence',
    confidence: null,
    evidence: [],
  };
}

function factsUnavailable(facts: RepoFacts): boolean {
  const empty = (values: readonly string[] | undefined) =>
    values === undefined || values.length === 0;
  return empty(facts.languages) && empty(facts.frameworks) && empty(facts.resourceTypes);
}

function groupEvidence(controlCode: string, findings: readonly EvidenceLike[]): GroupedEvidence {
  const active = findings.filter(
    (finding) =>
      finding.controlCode === controlCode &&
      finding.status !== 'false_positive' &&
      finding.status !== 'fixed',
  );
  const scanners = new Set(
    active.map((finding) => finding.scanner ?? 'unknown').filter((name) => name !== 'unknown'),
  );
  return {
    active,
    scanners,
    hasDirect: active.some((finding) => finding.confidence === 'direct'),
    corroborated: scanners.size >= 2,
  };
}

function toEvidenceReference(finding: EvidenceLike): EvidenceReferenceLike {
  return {
    kind: finding.kind,
    ...(finding.scanner === undefined ? {} : { scanner: finding.scanner }),
    ...(finding.scannerRuleId === undefined ? {} : { scannerRuleId: finding.scannerRuleId }),
    ...(finding.evidenceHash === undefined ? {} : { evidenceHash: finding.evidenceHash }),
    ...(finding.filePath === undefined ? {} : { filePath: finding.filePath }),
    ...(finding.lineStart === undefined ? {} : { lineStart: finding.lineStart }),
    ...(finding.lineEnd === undefined ? {} : { lineEnd: finding.lineEnd }),
    ...(finding.fingerprint === undefined ? {} : { fingerprint: finding.fingerprint }),
  };
}
