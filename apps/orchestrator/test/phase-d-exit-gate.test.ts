// apps/orchestrator/test/phase-d-exit-gate.test.ts
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
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

  it('CMP GTM and header fixtures pass with pinned scanner rules', () => {
    const semgrep = execFileSync('python3', ['tests/semgrep/check.py'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(semgrep).toMatch(/^Semgrep fixtures passed /m);
    const checkov = execFileSync(
      'python3',
      ['-m', 'pytest', 'apps/scan-runner/tests/test_custom_checkov_policies.py', '-q', '-v'],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(checkov).toMatch(/3 passed/);
  }, 60_000);

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
