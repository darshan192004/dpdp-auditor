import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { goldenManifestSchema, type GoldenManifest } from '@dpdpa/contracts';

import { loadRulePackV2 } from '../src/modules/rule-pack/rule-pack-v2.loader.js';
import {
  buildDetectorStatuses,
  evaluateControls,
} from '../src/modules/scoring/control-evaluator.js';
import { inventoryEvidence } from '../src/modules/scoring/inventory-evidence.js';

const REPO = resolve(__dirname, '../../..');
const PY_SRC = join(REPO, 'apps/scan-runner/src');
const PACK_DIR = join(REPO, 'packages/rule-packs/v2');
const FIXTURES = join(REPO, 'tests/golden-repos');
const CANARY = 'CANARY_PHASE_C_EXIT_GATE_NEVER_EMIT';
const FIXTURE_NAMES = ['fx-good-app', 'fx-bad-app', 'fx-silent-app'] as const;

const ANALYZE_SCRIPT = `
import json
import sys
from pathlib import Path
from scan_runner.dpdp_inventory import analyze_repo
print(json.dumps(analyze_repo(Path(sys.argv[1]), deadline_s=60), sort_keys=True))
`;

function runAnalyzer(name: string): unknown {
  const raw = execFileSync('python3', ['-c', ANALYZE_SCRIPT, join(FIXTURES, name)], {
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: PY_SRC },
    encoding: 'utf8',
  });
  expect(raw).not.toContain(CANARY);
  return JSON.parse(raw) as unknown;
}

function manifestFor(name: string): GoldenManifest {
  const raw = readFileSync(join(FIXTURES, name, 'manifest.yaml'), 'utf8');
  return goldenManifestSchema.parse(parse(raw));
}

async function runFixture(name: string) {
  const manifest = manifestFor(name);
  const loaded = await loadRulePackV2(PACK_DIR);
  const detectorStatuses = {
    ...buildDetectorStatuses({
      semgrep: 'completed',
      checkov: 'completed',
      gitleaks: 'completed',
    }),
  };
  const evaluations = [];
  for (let run = 0; run < 2; run += 1) {
    const report = runAnalyzer(name) as Parameters<typeof inventoryEvidence>[0]['report'];
    Object.assign(detectorStatuses, report?.detectorStatuses ?? {});
    evaluations.push(
      evaluateControls({
        controls: loaded.controls,
        facts: {
          languages: manifest.languages,
          frameworks: [],
          resourceTypes: [],
        },
        mappings: loaded.mappings,
        detectorStatuses,
        findings: inventoryEvidence({
          report,
          rules: loaded.inventoryRules,
          detectorStatuses,
        }),
        rulePackVersion: loaded.pack,
        scoringVersion: 'scoring-2.0.0',
      }),
    );
  }

  expect(JSON.stringify(evaluations[1]?.results)).toBe(JSON.stringify(evaluations[0]?.results));
  expect(JSON.stringify(evaluations[0]?.results)).not.toContain(CANARY);
  return { manifest, evaluation: evaluations[0]! };
}

describe('Phase C golden verdict exit gate', () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name} matches its declared verdict manifest`, async () => {
      const { manifest, evaluation } = await runFixture(name);
      expect(manifest.expectedVerdicts).toBeDefined();
      for (const expected of manifest.expectedVerdicts ?? []) {
        const actual = evaluation.byControl.get(expected.controlCode);
        expect(actual, `${name}: missing ${expected.controlCode}`).toBeDefined();
        expect(actual?.verdict).toBe(expected.verdict);
        if (expected.reasonCode !== undefined) {
          expect(actual?.reasonCode).toBe(expected.reasonCode);
        }
      }
      expect(evaluation.unknownControls).toEqual(
        expect.arrayContaining(
          (manifest.expectedVerdicts ?? [])
            .filter((entry) => entry.verdict === 'UNKNOWN')
            .map((entry) => entry.controlCode),
        ),
      );
    });
  }
});
