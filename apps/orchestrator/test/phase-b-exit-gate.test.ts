import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { validatePackV2 } from '@dpdpa/contracts';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';

const runFile = promisify(execFile);
const v1PackDir = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));
const v2PackDir = join(v1PackDir, 'v2');
const validatorCli = join(v1PackDir, 'scripts', 'validate-v2-pack.mjs');

interface PackFileLike {
  path: string;
  value: unknown;
  sha256: string;
}

interface ManifestLike {
  version: number;
  pack: string;
  generatedAt: string;
  files: Array<{ path: string; sha256: string }>;
}

interface ValidatorPayload {
  pack: string;
  issues: Array<{ path: string; code: string; message: string }>;
}

interface ControlDocument {
  controls: Array<{
    evidenceMode?: string;
    violationRules?: unknown[];
    absenceRules?: unknown[];
    positiveRules?: unknown[];
  }>;
}

const created: string[] = [];

async function tempCopy(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'phase-b-exit-'));
  created.push(dir);
  await cp(source, dir, { recursive: true });
  return dir;
}

/** Mirrors the validator CLI: every non-manifest file, raw-byte hashes, parsed YAML. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listFiles(full, base)));
    } else if (entry.isFile()) {
      const path = relative(base, full).split(sep).join('/');
      // CHANGELOG.md is Phase F documentation, not checksum-bearing pack content.
      if (path !== 'manifest.yaml' && path !== 'CHANGELOG.md') paths.push(path);
    }
  }
  return paths.sort();
}

async function readPack(dir: string): Promise<{ manifest: ManifestLike; files: PackFileLike[] }> {
  const manifest = parse(await readFile(join(dir, 'manifest.yaml'), 'utf8')) as ManifestLike;
  const files = await Promise.all(
    (await listFiles(dir)).map(async (path) => {
      const bytes = await readFile(join(dir, ...path.split('/')));
      return {
        path,
        value: parse(bytes.toString('utf8')) as unknown,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  );
  return { manifest, files };
}

async function refreshManifest(dir: string): Promise<void> {
  const { manifest, files } = await readPack(dir);
  const hashes = new Map(files.map((file) => [file.path, file.sha256]));
  const updated: ManifestLike = {
    ...manifest,
    files: manifest.files.map((file) => ({
      path: file.path,
      sha256: hashes.get(file.path) ?? file.sha256,
    })),
  };
  await writeFile(join(dir, 'manifest.yaml'), stringify(updated), 'utf8');
}

async function readControls(dir: string): Promise<ControlDocument> {
  return parse(await readFile(join(dir, 'controls.yaml'), 'utf8')) as ControlDocument;
}

async function writeControls(dir: string, document: ControlDocument): Promise<void> {
  await writeFile(join(dir, 'controls.yaml'), stringify(document), 'utf8');
}

function firstControl(document: ControlDocument) {
  const control = document.controls[0];
  if (!control) throw new Error('fixture control is missing');
  return control;
}

function structuredPayload(output: string): ValidatorPayload {
  const line = output.split('\n').find((candidate) => candidate.startsWith('{"pack":'));
  if (!line) throw new Error('validator did not emit a structured payload');
  return JSON.parse(line) as ValidatorPayload;
}

async function runValidator(
  dir: string,
): Promise<{ code: number; output: string; payload: ValidatorPayload }> {
  try {
    const { stdout, stderr } = await runFile(process.execPath, [validatorCli, dir], {
      encoding: 'utf8',
    });
    return { code: 0, output: `${stdout}${stderr}`, payload: structuredPayload(stdout) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: unknown };
    const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      output,
      payload: structuredPayload(output),
    };
  }
}

function hasCode(payload: ValidatorPayload, code: string): boolean {
  return payload.issues.some((issue) => issue.code === code);
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Phase B exit gate', () => {
  it('ships a v2 pack that validatePackV2 and the CLI accept without issues', async () => {
    const { manifest, files } = await readPack(v2PackDir);
    const issues = validatePackV2({ manifest, files });

    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBe(0);

    const result = await runValidator(v2PackDir);
    expect(result.code).toBe(0);
    expect(result.payload.issues.length).toBe(0);
  });

  it('rejects an evidence mode with no rules', async () => {
    const dir = await tempCopy(v2PackDir);
    const document = await readControls(dir);
    const control = firstControl(document);
    control.evidenceMode = 'violation';
    control.violationRules = [];
    control.absenceRules = [];
    control.positiveRules = [];
    await writeControls(dir, document);
    await refreshManifest(dir);

    const { manifest, files } = await readPack(dir);
    expect(validatePackV2({ manifest, files }).some((issue) => issue.code === 'missing_rule')).toBe(
      true,
    );

    const result = await runValidator(dir);
    expect(result.code).toBe(1);
    expect(hasCode(result.payload, 'missing_rule')).toBe(true);
  });

  it('rejects a rule reference to an undeclared detector', async () => {
    const fixtureDetector = 'undeclared_fixture_detector';
    const dir = await tempCopy(v2PackDir);
    const document = await readControls(dir);
    const control = firstControl(document);
    control.evidenceMode = 'absence';
    control.violationRules = [];
    control.positiveRules = [];
    control.absenceRules = [
      {
        id: 'absence.fixture_rule',
        detector: fixtureDetector,
        token: 'fixture_token',
        confidence: 'inferred',
      },
    ];
    await writeControls(dir, document);
    await refreshManifest(dir);

    const { manifest, files } = await readPack(dir);
    expect(
      validatePackV2({ manifest, files }).some((issue) => issue.code === 'orphan_detector'),
    ).toBe(true);

    const result = await runValidator(dir);
    expect(result.code).toBe(1);
    expect(hasCode(result.payload, 'orphan_detector')).toBe(true);
  });

  it('keeps the v1 loader working alongside a top-level v2 directory', async () => {
    const shipped = await loadRulePack(v1PackDir);
    expect(shipped.pack === 'dpdpa-2026.10.6').toBe(true);
    expect(shipped.scoringVersion === '1.0.0').toBe(true);

    const dir = await tempCopy(v1PackDir);
    await writeFile(join(dir, 'v2', 'controls.yaml'), 'version: 1\npack: fixture-only\n', 'utf8');
    const isolated = await loadRulePack(dir);
    expect(isolated.pack === 'dpdpa-2026.10.6').toBe(true);
    expect(isolated.scoringVersion === '1.0.0').toBe(true);
  });

  it('leaves the v1 scoring checksum intact', async () => {
    const manifest = parse(
      await readFile(join(v1PackDir, 'manifest.yaml'), 'utf8'),
    ) as ManifestLike;
    const expected = manifest.files.find((file) => file.path === 'scoring.yaml')?.sha256;
    expect(typeof expected).toBe('string');

    const actual = createHash('sha256')
      .update(await readFile(join(v1PackDir, 'scoring.yaml')))
      .digest('hex');
    expect(actual === expected).toBe(true);
  });
});
