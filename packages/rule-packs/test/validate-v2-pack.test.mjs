import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import process from 'node:process';
import { after, test } from 'node:test';
import YAML from 'yaml';

const runFile = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePack = join(root, 'v2');
const cli = join(root, 'scripts', 'validate-v2-pack.mjs');
const created = [];

after(async () => {
  for (const dir of created) await rm(dir, { recursive: true, force: true });
});

async function copyPack() {
  const dir = await mkdtemp(join(tmpdir(), 'dpdpa-v2-'));
  created.push(dir);
  await cp(sourcePack, dir, { recursive: true });
  return dir;
}

async function readYaml(dir, path) {
  return YAML.parse(await readFile(join(dir, ...path.split('/')), 'utf8'));
}

async function writeYaml(dir, path, value) {
  await writeFile(join(dir, ...path.split('/')), YAML.stringify(value), 'utf8');
}

function payloadFrom(text) {
  const line = text.split('\n').find((candidate) => candidate.startsWith('{"pack":'));
  assert.ok(line, 'validator must print exactly one structured JSON issue payload');
  return JSON.parse(line);
}

async function runValidator(dir) {
  try {
    const { stdout, stderr } = await runFile(process.execPath, [cli, dir], { encoding: 'utf8' });
    return { code: 0, output: `${stdout}${stderr}`, payload: payloadFrom(stdout) };
  } catch (error) {
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      output: `${stdout}${stderr}`,
      payload: payloadFrom(`${stdout}${stderr}`),
    };
  }
}

function codes(result) {
  return result.payload.issues.map((issue) => issue.code);
}

test('unmodified v2 pack validates with no issues', async () => {
  const result = await runValidator(await copyPack());
  assert.equal(result.code, 0);
  assert.equal(result.payload.pack, 'dpdpa-2026.11.0');
  assert.deepEqual(result.payload.issues, []);
});

test('duplicate control IDs are rejected', async () => {
  const dir = await copyPack();
  const controls = await readYaml(dir, 'controls.yaml');
  const duplicate = JSON.parse(JSON.stringify(controls.controls[0]));
  duplicate.title = 'Duplicate control';
  controls.controls.push(duplicate);
  await writeYaml(dir, 'controls.yaml', controls);

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('duplicate_control'));
});

test('detector references without a declaration are rejected', async () => {
  const dir = await copyPack();
  const controls = await readYaml(dir, 'controls.yaml');
  controls.controls[0].evidenceMode = 'absence';
  controls.controls[0].absenceRules = [
    {
      id: 'absence.consent_gate',
      detector: 'ghost_detector',
      token: 'consent_gate',
      confidence: 'inferred',
    },
  ];
  await writeYaml(dir, 'controls.yaml', controls);

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('orphan_detector'));
});

test('evidence modes without rules are rejected', async () => {
  const dir = await copyPack();
  const controls = await readYaml(dir, 'controls.yaml');
  controls.controls[0].evidenceMode = 'violation';
  await writeYaml(dir, 'controls.yaml', controls);

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('missing_rule'));
});

test('empty legal reference arrays are rejected', async () => {
  const dir = await copyPack();
  const controls = await readYaml(dir, 'controls.yaml');
  controls.controls[0].legalRefs = [];
  await writeYaml(dir, 'controls.yaml', controls);

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('missing_legal_ref'));
});

test('non-ISO commencement dates are rejected', async () => {
  const dir = await copyPack();
  const commencement = await readYaml(dir, 'commencement.yaml');
  commencement.entries[0].effectiveFrom = '15-11-2026';
  await writeYaml(dir, 'commencement.yaml', commencement);

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('invalid_commencement'));
});

test('source-content keys are rejected without echoing their values', async () => {
  const dir = await copyPack();
  const mappings = await readYaml(dir, 'mappings/inventory.yaml');
  mappings.mappings.push({
    detector: 'schema_scan',
    control: 'DPDPA-8.4-SECRET-01',
    confidence: 'inferred',
    rationale: 'local fixture',
    snippet: 'CANARY_LOCAL_FIXTURE',
  });
  await writeYaml(dir, 'mappings/inventory.yaml', mappings);

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('source_content_field'));
  assert.ok(!result.output.includes('CANARY_LOCAL_FIXTURE'));
});

test('byte drift against a manifest hash is rejected', async () => {
  const dir = await copyPack();
  const target = join(dir, 'detectors.yaml');
  await writeFile(target, `${await readFile(target, 'utf8')}\n# drift\n`, 'utf8');

  const result = await runValidator(dir);
  assert.equal(result.code, 1);
  assert.ok(codes(result).includes('checksum_mismatch'));
});

// The shipped v1 pack regression lives in Task 2's rule-pack.loader.test.ts.
// It is deliberately not spawned here: this suite stays offline and fast.
