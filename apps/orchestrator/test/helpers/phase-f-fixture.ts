import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenManifestSchema, type GoldenManifest } from '@dpdpa/contracts';
import { parse } from 'yaml';
import { loadRulePack } from '../../src/modules/rule-pack/rule-pack.loader.js';
import {
  buildDetectorStatuses,
  evaluateControls,
  type ControlEvaluation,
  type ControlResultLike,
  type DetectorStatus,
  type EvidenceLike,
  type EvidenceReferenceLike,
} from '../../src/modules/scoring/control-evaluator.js';
import type { RedactedSinkInput } from '../../src/modules/scoring/redacted-sinks.js';
import { scoreScanV2, type ScoreResultV2 } from '../../src/modules/scoring/scoring.v2.js';

export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export const PACK_DIR = join(ROOT, 'packages/rule-packs');
export const FIXTURE_ROOT = join(ROOT, 'tests/golden-repos');
export const CANARY_PATTERN = /CANARY_[A-Za-z0-9_]+/g;

export interface FixtureRun {
  dir: string;
  name: string;
  manifest: GoldenManifest;
  findings: EvidenceLike[];
  detectorStatuses: Record<string, DetectorStatus>;
  evaluation: ControlEvaluation;
  scored: ScoreResultV2;
}

export function fixtureDirs(): string[] {
  return readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => join(FIXTURE_ROOT, entry.name))
    .sort();
}

export function readSources(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        entry.name !== 'manifest.yaml' &&
        !entry.name.startsWith('README')
      ) {
        files.push(path);
      }
    }
  };
  walk(dir);
  return files.sort();
}

export function canaryMarker(dir: string): string {
  const markers = new Set<string>();
  for (const file of readSources(dir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(CANARY_PATTERN)) markers.add(match[0]);
  }
  if (markers.size !== 1) {
    throw new Error(`${basename(dir)}: expected one distinct canary marker, got ${markers.size}`);
  }
  return [...markers][0]!;
}

export function loadManifest(dir: string): GoldenManifest {
  return goldenManifestSchema.parse(parse(readFileSync(join(dir, 'manifest.yaml'), 'utf8')));
}

export function syntheticFindings(dir: string, manifest: GoldenManifest): EvidenceLike[] {
  return manifest.expectedFindings.map((expected) => ({
    controlCode: expected.control ?? null,
    kind: 'violation' as const,
    scanner: expected.scanner as NonNullable<EvidenceLike['scanner']>,
    scannerRuleId: expected.ruleId,
    evidenceHash:
      'sha256:' +
      createHash('sha256')
        .update(`${basename(dir)}:${expected.ruleId}`)
        .digest('hex'),
    filePath: `src/${basename(dir)}/fixture.ts`,
    lineStart: 1,
    lineEnd: 1,
    fingerprint: `fixture:${basename(dir)}:${expected.ruleId}`,
    severity: expected.severity,
    confidence: expected.confidence,
    status: 'open' as const,
  }));
}

type HostileEvidence = EvidenceLike & {
  rawSource: string;
  rawScannerOutput: string;
  matchedValue: string;
};

type HostileEvidenceReference = EvidenceReferenceLike & {
  rawSource: string;
  matchedValue: string;
};

type HostileControlResult = ControlResultLike & {
  rawNotes: string;
  evidence: HostileEvidenceReference[];
};

type HostileScore = ScoreResultV2 & { rawNotes: string };

export interface HostileSinkInputs {
  marker: string;
  markerPresentInHostileFields: boolean;
  input: RedactedSinkInput;
}

/**
 * Deliberately places a fixture canary in unallowlisted fields. Sinks must
 * serialize only their allowlisted representations, so the marker must be
 * present here and absent from every sink output.
 */
export function hostileSinkInputs(dir: string, run: FixtureRun): HostileSinkInputs {
  const marker = canaryMarker(dir);
  const findings: HostileEvidence[] = run.findings.map((finding) => ({
    ...finding,
    rawSource: `${marker} source excerpt`,
    rawScannerOutput: `${marker} raw scanner output`,
    matchedValue: marker,
  }));
  const controlResults: HostileControlResult[] = run.evaluation.results.map(
    (result): HostileControlResult => ({
      ...result,
      rawNotes: `${marker} internal note`,
      evidence: result.evidence.map((item): HostileEvidenceReference => ({
        ...item,
        rawSource: `${marker} evidence excerpt`,
        matchedValue: marker,
      })),
    }),
  );
  const score: HostileScore = { ...run.scored, rawNotes: `${marker} internal note` };
  const markerPresentInHostileFields =
    findings.every(
      (finding) =>
        finding.rawSource.includes(marker) &&
        finding.rawScannerOutput.includes(marker) &&
        finding.matchedValue.includes(marker),
    ) &&
    controlResults.every(
      (result) =>
        result.rawNotes.includes(marker) &&
        result.evidence.every(
          (item: HostileEvidenceReference) =>
            item.rawSource.includes(marker) && item.matchedValue.includes(marker),
        ),
    ) &&
    score.rawNotes.includes(marker);
  return {
    marker,
    markerPresentInHostileFields,
    input: {
      controlResults,
      findings,
      score,
      verdictCounts: run.scored.verdictCounts,
      unknownControls: run.scored.unknownControls,
      detectorStatuses: run.detectorStatuses,
      evidenceCoverage: run.scored.evidenceCoverage,
    },
  };
}

export async function runFixture(dir: string): Promise<FixtureRun> {
  const manifest = loadManifest(dir);
  const pack = await loadRulePack(PACK_DIR);
  const coverage: Record<string, 'completed' | 'timed_out'> = Object.fromEntries(
    manifest.scanners.map((scanner) => [scanner, 'completed' as const]),
  );
  if (basename(dir) === 'scanner-timeout') coverage.gitleaks = 'timed_out';
  const detectorStatuses = buildDetectorStatuses(coverage);
  const findings = syntheticFindings(dir, manifest);
  const evaluation = evaluateControls({
    controls: pack.controls,
    facts: { languages: manifest.languages },
    mappings: pack.mappings,
    detectorStatuses,
    findings,
    rulePackVersion: pack.pack,
    scoringVersion: 'scoring-2.0.0',
  });
  const scored = scoreScanV2({
    findings: findings.map((finding) => ({
      controlCode: finding.controlCode,
      severity: finding.severity,
      status: finding.status ?? 'open',
    })),
    controls: pack.controls,
    facts: { languages: manifest.languages },
    coverage: manifest.expectedCoverage,
    results: evaluation.results,
  });
  return { dir, name: basename(dir), manifest, findings, detectorStatuses, evaluation, scored };
}
