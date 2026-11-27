import { createHash } from 'node:crypto';

import type { DetectorStatus } from '@dpdpa/contracts';
import type { InventoryRule } from '../rule-pack/rule-pack.loader.js';
import type { ControlEvidence } from './control-evaluator.js';

export interface InventorySignalLike {
  detector: string;
  kind: string;
  path: string;
  line: number | null;
  token: string;
  count?: number | null | undefined;
}

export interface InventoryFactLike {
  key: string;
  signals: readonly InventorySignalLike[];
  detectedAt: string;
}

export interface InventoryReportLike {
  inventoryVersion: string;
  facts: readonly InventoryFactLike[];
  signals: readonly InventorySignalLike[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
}

export interface InventoryEvidenceInput {
  report: InventoryReportLike | undefined;
  rules: readonly InventoryRule[];
  detectorStatuses: Readonly<Record<string, DetectorStatus>>;
}

/** Turns bounded inventory signals into evidence references, never source text. */
export function inventoryEvidence(input: InventoryEvidenceInput): ControlEvidence[] {
  const report = input.report;
  if (report === undefined || report.inventoryVersion !== 'inventory-1.0.0') return [];

  const signals = dedupeSignals([
    ...report.signals,
    ...report.facts.flatMap((fact) => [...fact.signals]),
  ]);
  const needSignals = signals.filter(
    (signal) =>
      signal.token.startsWith('pii_field.') ||
      signal.token === 'consent_gate' ||
      signal.token === 'privacy_notice_link',
  );
  const needDetectors = new Set(needSignals.map((signal) => signal.detector));
  const seen = new Set<string>();
  const evidence: ControlEvidence[] = [];

  for (const rule of input.rules) {
    if (input.detectorStatuses[rule.detector] !== 'completed') continue;
    const key = `${rule.mode}|${rule.controlCode}|${rule.detector}|${rule.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = signals.filter(
      (signal) => signal.detector === rule.detector && signal.token === rule.token,
    );
    if (rule.mode === 'positive' && matches.length > 0) {
      evidence.push(toFinding(rule, matches[0]!, 'positive'));
      continue;
    }
    const absenceRequired =
      needDetectors.has(rule.detector) ||
      // Artefact obligations (notice, backup) are repository-wide: any observed
      // personal-data need signal makes an absent artefact a cited gap, even
      // when the need came from a different detector.
      (rule.detector === 'artefact_scan' && needSignals.length > 0);
    if (rule.mode === 'absence' && matches.length === 0 && absenceRequired) {
      evidence.push(toMissingFinding(rule));
    }
  }
  return evidence.sort((a, b) => fingerprint(a).localeCompare(fingerprint(b)));
}

function toFinding(
  rule: InventoryRule,
  signal: InventorySignalLike,
  kind: 'positive',
): ControlEvidence {
  const digest = createHash('sha256')
    .update(`${rule.detector}|${signal.path}|${signal.line}|${signal.token}`)
    .digest('hex');
  return {
    controlCode: rule.controlCode,
    kind,
    scanner: rule.detector,
    scannerRuleId: rule.token,
    evidenceHash: `sha256:${digest}`,
    filePath: signal.path,
    lineStart: signal.line,
    lineEnd: signal.line,
    fingerprint: `inv_${digest.slice(0, 24)}`,
    severity: 'medium',
    confidence: rule.confidence,
    status: 'open',
  };
}

function toMissingFinding(rule: InventoryRule): ControlEvidence {
  const path = rule.pathHint ?? 'repository';
  const digest = createHash('sha256')
    .update(`${rule.detector}|${path}|${rule.token}|absent`)
    .digest('hex');
  return {
    controlCode: rule.controlCode,
    kind: 'missing_control',
    scanner: rule.detector,
    scannerRuleId: rule.token,
    evidenceHash: `sha256:${digest}`,
    filePath: path,
    lineStart: null,
    lineEnd: null,
    fingerprint: `inv_${digest.slice(0, 24)}`,
    severity: 'medium',
    confidence: rule.confidence,
    status: 'open',
  };
}

function dedupeSignals(signals: readonly InventorySignalLike[]): InventorySignalLike[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.detector}|${signal.path}|${signal.line ?? ''}|${signal.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fingerprint(finding: ControlEvidence): string {
  return finding.fingerprint ?? finding.evidenceHash ?? '';
}
