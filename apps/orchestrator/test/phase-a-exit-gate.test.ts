import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { goldenManifestSchema } from '@dpdpa/contracts';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';
import {
  buildDetectorStatuses,
  evaluateControls,
  type EvidenceLike,
} from '../src/modules/scoring/control-evaluator.js';
import { scoreScanV2 } from '../src/modules/scoring/scoring.v2.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const packDir = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));
const fixtureDir = `${root}tests/golden-repos/fx-silent-app/`;

/**
 * Canary coverage is deliberately narrow. The marker is read from fixture
 * source and checked only against in-memory serialized strings produced by
 * this offline test. It proves nothing about database rows, object storage,
 * log sinks, callbacks, or HTTP API responses; those surfaces belong to the
 * approval-gated manual/pipeline WebGoat smoke gate, not to CI.
 */
function canaryMarker(): string {
  const source = readFileSync(`${fixtureDir}src/silent.py`, 'utf8');
  const marker = source.match(/CANARY_[A-Za-z0-9_]+/)?.[0];
  expect(marker).toBeDefined();
  return marker!;
}

/** Synthetic finding only: no repository URL, no network, no scan. */
function syntheticSecretFinding(): EvidenceLike {
  return {
    controlCode: 'DPDPA-8.4-SECRET-01',
    kind: 'violation',
    scanner: 'gitleaks',
    scannerRuleId: 'generic-api-key',
    evidenceHash: 'sha256:2389c7fb2b3b53c985eba440fc8f23bc38c62d4abe0b6f857dc698dd8468f876',
    filePath: 'src/fixture/synthetic-secret.java',
    lineStart: 63,
    lineEnd: 63,
    fingerprint: 'fixture:webgoat:generic-api-key',
    severity: 'critical',
    confidence: 'direct',
    status: 'open',
  };
}

async function silentRun() {
  const manifest = goldenManifestSchema.parse(
    parse(readFileSync(`${fixtureDir}manifest.yaml`, 'utf8')),
  );
  const pack = await loadRulePack(packDir);
  const detectorStatuses = buildDetectorStatuses(
    Object.fromEntries(manifest.scanners.map((scanner) => [scanner, 'completed'])),
  );
  const evaluation = evaluateControls({
    controls: pack.controls,
    facts: {
      languages: manifest.languages,
      frameworks: [],
      resourceTypes: [],
    },
    mappings: pack.mappings,
    detectorStatuses,
    findings: [],
    rulePackVersion: pack.pack,
    scoringVersion: 'scoring-2.0.0',
  });
  const scored = scoreScanV2({
    findings: [],
    controls: pack.controls,
    facts: { languages: manifest.languages },
    coverage: 'full',
    results: evaluation.results,
  });
  return { manifest, detectorStatuses, evaluation, scored };
}

function serializedOutput(
  run: Awaited<ReturnType<typeof silentRun>>,
  findings: EvidenceLike[] = [],
): Record<string, unknown> {
  return {
    controlResults: run.evaluation.results,
    score: run.scored,
    detectorStatuses: run.detectorStatuses,
    findings,
    manifest: run.manifest,
  };
}

describe('Phase A exit gate', () => {
  it('fx-silent-app shows insufficient evidence and no letter', async () => {
    const run = await silentRun();

    expect(run.evaluation.unknownControls.length).toBeGreaterThan(0);
    expect(run.scored.score).toBeNull();
    expect(run.scored.grade).toBeNull();
    expect(run.scored.gradeWithheldReason).toBe('insufficient_evidence');
    expect(run.scored.unknownControls.length).toBeGreaterThan(0);
  });

  it('a direct secret finding produces a gap and no A grade', async () => {
    const pack = await loadRulePack(packDir);
    const control = pack.controls.find((item) => item.code === 'DPDPA-8.4-SECRET-01');
    expect(control).toBeDefined();
    const finding = syntheticSecretFinding();

    const evaluation = evaluateControls({
      controls: [control!],
      facts: { languages: ['java'] },
      mappings: pack.mappings,
      detectorStatuses: { gitleaks: 'completed' },
      findings: [finding],
      rulePackVersion: pack.pack,
      scoringVersion: 'scoring-2.0.0',
    });
    const scored = scoreScanV2({
      findings: [],
      controls: [control!],
      facts: { languages: ['java'] },
      coverage: 'full',
      results: evaluation.results,
    });

    expect(evaluation.results[0]?.verdict).toBe('FAIL');
    expect(evaluation.results[0]?.evidence[0]?.fingerprint).toBe(finding.fingerprint);
    expect(scored.score).toBe(0);
    expect(scored.grade).toBe('F');
    expect(scored.grade).not.toBe('A');
    expect(scored.gradeWithheldReason).toBeNull();
  });

  it('never emits the fixture source canary in serialized outputs', async () => {
    const marker = canaryMarker();
    const run = await silentRun();
    const serialized = JSON.stringify(serializedOutput(run, [syntheticSecretFinding()]));

    // Boolean assertion: a failure must not print or persist the marker.
    expect(serialized.includes(marker)).toBe(false);
  });

  it('runs the silent fixture twice with byte-identical serialized control results', async () => {
    const first = serializedOutput(await silentRun());
    const second = serializedOutput(await silentRun());

    expect(JSON.stringify(second) === JSON.stringify(first)).toBe(true);

    const firstBytes = JSON.stringify(first);
    expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(firstBytes)).toBe(false);
    expect(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(firstBytes),
    ).toBe(false);
  });
});
