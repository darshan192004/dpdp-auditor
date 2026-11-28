// apps/orchestrator/test/phase-d-exit-gate.test.ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { validatePackV2 } from '@dpdpa/contracts';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const packDir = join(repo, 'packages', 'rule-packs');
const v2 = join(packDir, 'v2');

function listV2Files(dir = v2, base = v2): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return listV2Files(full, base);
      const rel = relative(base, full).split('\\').join('/');
      return rel === 'manifest.yaml' ? [] : [rel];
    })
    .sort();
}

function readYaml(relativePath: string): unknown {
  return YAML.parse(readFileSync(join(v2, ...relativePath.split('/')), 'utf8'));
}

describe('Phase D exit gate', () => {
  it('shipped v2 pack validates with no issues and at least 45 controls', () => {
    const supplied = listV2Files().map((path) => {
      const bytes = readFileSync(join(v2, ...path.split('/')));
      return {
        path,
        value: path.endsWith('.yaml') ? YAML.parse(bytes.toString('utf8')) : null,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
    expect(validatePackV2({ files: supplied, manifest: readYaml('manifest.yaml') })).toEqual([]);
    const controls = readYaml('controls.yaml') as { controls: unknown[] };
    expect(controls.controls.length).toBeGreaterThanOrEqual(45);
  });

  it('checksum manifest covers exactly the shipped v2 files', () => {
    const manifest = readYaml('manifest.yaml') as {
      files: Array<{ path: string; sha256: string }>;
    };
    expect(manifest.files.map((file) => file.path)).toEqual(listV2Files());
    for (const file of manifest.files) {
      const bytes = readFileSync(join(v2, ...file.path.split('/')));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
  });

  it('v1 pack still loads with its legacy scoring version', async () => {
    const pack = await loadRulePack(packDir);
    expect(pack.pack).toBe('dpdpa-2026.10.6');
    expect(pack.scoringVersion).toBe('1.0.0');
    expect(pack.controls.length).toBeGreaterThanOrEqual(19);
  });

  it('CMP GTM and header scanner artifacts are statically wired to pinned rules', () => {
    const readRepoText = (path: string): string =>
      readFileSync(join(repo, ...path.split('/')), 'utf8');

    const pins = readRepoText('apps/scan-runner/src/scan_runner/versions.py');
    expect(pins).toMatch(/"semgrep": "1\.95\.0"/);
    expect(pins).toMatch(/"checkov": "3\.2\.0"/);

    const semgrepRulesPath = 'packages/rule-packs/custom/semgrep/dpdpa-v2-web.yaml';
    const semgrepRulesRaw = readRepoText(semgrepRulesPath);
    expect(semgrepRulesRaw).toMatch(/^# semgrep==1\.95\.0$/m);
    const semgrepRules = YAML.parse(semgrepRulesRaw) as { rules: Array<{ id: string }> };
    const ruleIds = [
      'dpdpa.v2.cmp.consent-mode-disabled',
      'dpdpa.v2.header.hsts-disabled',
      'dpdpa.v2.cookie.missing-secure-flag',
    ];
    expect(semgrepRules.rules.map((rule) => rule.id)).toEqual(ruleIds);

    const semgrepFixture = readRepoText('tests/semgrep/dpdpa.v2-web.js');
    for (const id of ruleIds) {
      expect(semgrepFixture).toContain(`ruleid: ${id}`);
      expect(semgrepFixture).toContain(`ok: ${id}`);
    }

    const checkScript = readRepoText('tests/semgrep/check.py');
    expect(checkScript).toContain('packages/rule-packs/semgrep/dpdpa.yaml');
    expect(checkScript).toContain(semgrepRulesPath);
    expect(checkScript).toContain('fixtures.glob("dpdpa.*")');
    for (const name of [
      'dpdpa.handlers.js',
      'dpdpa.js',
      'dpdpa.missing.md',
      'dpdpa.py',
      'dpdpa.reference.md',
      'dpdpa.v2-web.js',
    ]) {
      expect(existsSync(join(repo, 'tests', 'semgrep', name))).toBe(true);
    }

    const checkovPolicy = readRepoText(
      'packages/rule-packs/custom/checkov/dpdp_security_checks.py',
    );
    expect(checkovPolicy).toMatch(/^# checkov==3\.2\.0$/m);
    expect(checkovPolicy).toContain('id="ckv_dpdp_a_1"');

    const checkovTest = readRepoText('apps/scan-runner/tests/test_custom_checkov_policies.py');
    expect(checkovTest).toContain('CHECK_ID = "ckv_dpdp_a_1"');
    expect(checkovTest).toMatch(
      /assert CHECK_ID in _failed_ids\(ROOT \/ "tests\/golden-repos\/fx-cmp-header"\)/,
    );
    expect(checkovTest).toMatch(
      /assert CHECK_ID not in _failed_ids\(ROOT \/ "tests\/golden-repos\/fx-gtm-web"\)/,
    );
    for (const fixtureName of ['fx-cmp-header', 'fx-gtm-web']) {
      for (const file of ['main.tf', 'manifest.yaml']) {
        expect(existsSync(join(repo, 'tests', 'golden-repos', fixtureName, file))).toBe(true);
      }
    }
  });

  it('no forbidden product wording is present in v2 pack content', () => {
    const forbidden = ['compliant', 'non-compliant', 'violation of the Act', 'certified'];
    for (const path of [
      'controls.yaml',
      'detectors.yaml',
      'templates/remediation.md',
      'templates/privacy-notice.md',
      'templates/breach-runbook.md',
      'templates/dsr-sop.md',
      'templates/retention-schedule.md',
      'templates/processor-list.md',
    ]) {
      const raw = readFileSync(join(v2, ...path.split('/')), 'utf8').toLowerCase();
      for (const word of forbidden) {
        expect(raw.includes(word), `${path} contains forbidden wording: ${word}`).toBe(false);
      }
    }
  });
});
