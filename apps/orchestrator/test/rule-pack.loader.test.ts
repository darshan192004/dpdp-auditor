import { generateKeyPairSync, sign } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildManifest,
  loadRulePack,
  manifestPayload,
  RulePackError,
  stringifyManifest,
} from '../src/modules/rule-pack/rule-pack.loader.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));
const PACK = 'dpdpa-2026.10.1';

const roots: string[] = [];

async function copyPack(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rule-pack-'));
  roots.push(root);
  const dir = join(root, 'pack');
  await cp(PACK_DIR, dir, { recursive: true });
  return dir;
}

async function rewriteManifest(dir: string): Promise<void> {
  const manifest = await buildManifest(dir, { pack: PACK, generatedAt: '2026-11-12T00:00:00Z' });
  await writeFile(join(dir, 'manifest.yaml'), stringifyManifest(manifest));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('loadRulePack (P4-01, P4-02)', () => {
  it('loads the shipped pack and exposes controls, mappings, and scoring config', async () => {
    const pack = await loadRulePack(PACK_DIR);
    expect(pack.pack).toBe(PACK);
    expect(pack.effectiveFrom).toBe('2026-10-15');
    expect(pack.scoringVersion).toBe('1.0.0');
    expect(pack.controls).toHaveLength(19);
    expect(pack.mappings).toHaveLength(33);
    expect(pack.suppressions).toEqual([]);
    expect(pack.sectionWeights['8(4)']).toBe(30);
    expect(pack.grades.map((grade) => grade.grade)).toEqual(['A', 'B', 'C', 'D', 'F']);
    expect(pack.controlsByCode.get('DPDPA-8.4-ENC-01')?.weight).toBe(5);
    expect(pack.controlsByCode.get('DPDPA-12-ACCESS-01')?.scored).toBe(false);
  });

  it('fails closed when a pack file is tampered with', async () => {
    const dir = await copyPack();
    await writeFile(
      join(dir, 'dpdpa-controls.yaml'),
      `${await readFile(join(dir, 'dpdpa-controls.yaml'), 'utf8')}\n# tampered\n`,
    );
    await expect(loadRulePack(dir)).rejects.toThrow(RulePackError);
    await expect(loadRulePack(dir)).rejects.toThrow(/hash/);
  });

  it('rejects a YAML file that the manifest does not cover', async () => {
    const dir = await copyPack();
    await writeFile(join(dir, 'mappings', 'extra.yaml'), 'version: 1\n');
    await expect(loadRulePack(dir)).rejects.toThrow(/not covered by the manifest/);
  });

  it('rejects a missing pack file', async () => {
    const dir = await copyPack();
    await rm(join(dir, 'mappings', 'gitleaks.yaml'));
    await expect(loadRulePack(dir)).rejects.toThrow(/missing pack file/);
  });

  it('rejects a mapping to a control that does not exist', async () => {
    const dir = await copyPack();
    const path = join(dir, 'mappings', 'checkov.yaml');
    const raw = await readFile(path, 'utf8');
    await writeFile(path, raw.replace('DPDPA-8.4-ENC-01', 'DPDPA-9.9-XXX-99'));
    await rewriteManifest(dir);
    await expect(loadRulePack(dir)).rejects.toThrow(/unknown control/);
  });

  it('rejects a secret suppression without a hash scope', async () => {
    const dir = await copyPack();
    await writeFile(
      join(dir, 'suppressions.yaml'),
      [
        'version: 1',
        `pack: ${PACK}`,
        'suppressions:',
        '  - id: test-keys',
        '    paths: ["**/tests/**"]',
        '    scanners: [gitleaks]',
        '    controls: [DPDPA-8.4-SECRET-01]',
        '    reason: A reviewed fixture key that cannot authenticate.',
        '    reviewedBy: security@example.com',
        '    expiresAt: "2027-01-01"',
        '',
      ].join('\n'),
    );
    await rewriteManifest(dir);
    await expect(loadRulePack(dir)).rejects.toThrow(/hash scope/);
  });

  it('rejects a pack that mixes pack names', async () => {
    const dir = await copyPack();
    const path = join(dir, 'scoring.yaml');
    await writeFile(path, (await readFile(path, 'utf8')).replace(PACK, 'dpdpa-2027.01.1'));
    await rewriteManifest(dir);
    await expect(loadRulePack(dir)).rejects.toThrow(/belongs to pack/);
  });

  it('accepts a valid Ed25519 signature and rejects a signature from another key', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const dir = await copyPack();
    const manifest = await buildManifest(dir, {
      pack: PACK,
      generatedAt: '2026-11-12T00:00:00Z',
    });
    manifest.signature = sign(null, manifestPayload(manifest), privateKey).toString('base64');
    await writeFile(join(dir, 'manifest.yaml'), stringifyManifest(manifest));

    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await expect(loadRulePack(dir, { publicKeyPem: pem })).resolves.toMatchObject({ pack: PACK });

    const other = generateKeyPairSync('ed25519').publicKey.export({
      type: 'spki',
      format: 'pem',
    });
    await expect(loadRulePack(dir, { publicKeyPem: other.toString() })).rejects.toThrow(
      /signature is invalid/,
    );
  });

  it('fails closed when a public key is configured but the manifest is unsigned', async () => {
    const dir = await copyPack();
    const pem = generateKeyPairSync('ed25519')
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();
    await expect(loadRulePack(dir, { publicKeyPem: pem })).rejects.toThrow(/not signed/);
  });

  it('rejects invalid YAML with a RulePackError', async () => {
    const dir = await copyPack();
    await writeFile(join(dir, 'scoring.yaml'), 'version: [unclosed\n');
    await rewriteManifest(dir);
    await expect(loadRulePack(dir)).rejects.toThrow(RulePackError);
  });
});
