import type {
  Confidence,
  Control,
  Mapping,
  Scanner,
  Severity,
} from '../rule-pack/rule-pack.schemas.js';

export type FindingStatus = 'open' | 'false_positive' | 'accepted_risk' | 'fixed' | 'reopened';

export interface NormalizedFinding {
  scanner: Scanner;
  scannerRuleId: string;
  scannerRuleVersion?: string | undefined;
  scannerSeverity: Severity;
  filePath?: string | null | undefined;
  lineStart?: number | null | undefined;
  lineEnd?: number | null | undefined;
  message?: string | undefined;
  evidenceHash?: string | null | undefined;
  fingerprint: string;
  context?: Record<string, unknown> | undefined;
  status?: FindingStatus | undefined;
}

export interface MappedFinding {
  scanner: Scanner;
  scannerRuleId: string;
  scannerRuleVersion: string;
  scannerSeverity: Severity;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  message: string;
  evidenceHash: string | null;
  fingerprint: string;
  context: Record<string, unknown>;
  status: FindingStatus;
  controlCode: string | null;
  control: Control | null;
  severity: Severity;
  confidence: Confidence;
  rationale: string | null;
  remediation: string | null;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * P4-04 / P4-07. Exact scanner-version mappings win entirely; a wildcard is a
 * fallback, not an addition. Fan-out emits one finding per control, duplicate
 * controls are collapsed, and persisted severity is the higher of scanner and
 * control severity.
 */
export function resolveMappings(
  finding: NormalizedFinding,
  mappings: readonly Mapping[],
  controls: ReadonlyMap<string, Control>,
): MappedFinding[] {
  const version = finding.scannerRuleVersion ?? '';
  const exact = mappings.filter(
    (mapping) =>
      mapping.scanner === finding.scanner &&
      mapping.ruleId === finding.scannerRuleId &&
      mapping.scannerRuleVersion === version,
  );
  const wildcard = mappings.filter(
    (mapping) =>
      mapping.scanner === finding.scanner &&
      mapping.ruleId === finding.scannerRuleId &&
      mapping.scannerRuleVersion === '*',
  );
  const selected = exact.length > 0 ? exact : wildcard;
  if (selected.length === 0) {
    return [toMapped(finding, null, finding.scannerSeverity, 'direct', null, null)];
  }

  const byControl = new Map<string, Mapping>();
  for (const mapping of selected) {
    if (!byControl.has(mapping.controlCode)) {
      byControl.set(mapping.controlCode, mapping);
    }
  }

  return [...byControl.values()].map((mapping) => {
    const control = controls.get(mapping.controlCode);
    if (!control) {
      throw new Error(`mapping references unknown control ${mapping.controlCode}`);
    }
    return toMapped(
      finding,
      control,
      maxSeverity(finding.scannerSeverity, control.severity),
      mapping.confidence,
      mapping.rationale,
      mapping.remediationTemplate,
    );
  });
}

function toMapped(
  finding: NormalizedFinding,
  control: Control | null,
  severity: Severity,
  confidence: Confidence,
  rationale: string | null,
  remediation: string | null,
): MappedFinding {
  return {
    scanner: finding.scanner,
    scannerRuleId: finding.scannerRuleId,
    scannerRuleVersion: finding.scannerRuleVersion ?? '*',
    scannerSeverity: finding.scannerSeverity,
    filePath: finding.filePath ?? null,
    lineStart: finding.lineStart ?? null,
    lineEnd: finding.lineEnd ?? null,
    message: finding.message ?? '',
    evidenceHash: finding.evidenceHash ?? null,
    fingerprint: control ? `${finding.fingerprint}:${control.code}` : finding.fingerprint,
    context: { ...finding.context, scannerSeverity: finding.scannerSeverity },
    status: finding.status ?? 'open',
    controlCode: control?.code ?? null,
    control,
    severity,
    confidence,
    rationale,
    remediation,
  };
}
