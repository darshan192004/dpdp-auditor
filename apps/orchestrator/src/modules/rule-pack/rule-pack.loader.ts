import { createHash, verify } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import type { z } from 'zod';
import {
  controlsFileSchema,
  manifestSchema,
  mappingsFileSchema,
  scoringFileSchema,
  suppressionsFileSchema,
  type Control,
  type GradeBand,
  type Manifest,
  type Mapping,
  type Suppression,
} from './rule-pack.schemas.js';

export class RulePackError extends Error {
  constructor(
    readonly code:
      | 'RULE_PACK_MISSING'
      | 'RULE_PACK_INVALID'
      | 'RULE_PACK_HASH_MISMATCH'
      | 'RULE_PACK_SIGNATURE_INVALID'
      | 'RULE_PACK_UNKNOWN_FILE',
    message: string,
  ) {
    super(message);
    this.name = 'RulePackError';
  }
}

export interface LoadedRulePack {
  pack: string;
  effectiveFrom: string;
  scoringVersion: string;
  controls: Control[];
  controlsByCode: Map<string, Control>;
  mappings: Mapping[];
  suppressions: Suppression[];
  sectionWeights: Record<string, number>;
  grades: GradeBand[];
}

export interface LoadRulePackOptions {
  publicKeyPem?: string | undefined;
}

const MANIFEST = 'manifest.yaml';

/**
 * P4-01 / P4-02. Verifies the manifest hash of every pack file before parsing
 * it, and verifies the Ed25519 signature when a public key is configured.
 * Unknown YAML files are rejected: an unlisted file is either a packaging
 * mistake or tampering, and both must fail closed.
 */
export async function loadRulePack(
  dir: string,
  options: LoadRulePackOptions = {},
): Promise<LoadedRulePack> {
  const rawManifest = await readFile(join(dir, MANIFEST), 'utf8').catch(() => {
    throw new RulePackError('RULE_PACK_MISSING', `missing ${MANIFEST} in ${dir}`);
  });
  const manifest = parseYaml(rawManifest, MANIFEST, manifestSchema);

  const present = (await listYaml(dir)).filter((path) => path !== MANIFEST);
  const listed = manifest.files.map((file) => file.path).sort();
  const unknown = present.filter((path) => !listed.includes(path));
  if (unknown.length > 0) {
    throw new RulePackError(
      'RULE_PACK_UNKNOWN_FILE',
      `files not covered by the manifest: ${unknown.join(', ')}`,
    );
  }
  for (const file of manifest.files) {
    const bytes = await readFile(join(dir, ...file.path.split('/'))).catch(() => {
      throw new RulePackError('RULE_PACK_MISSING', `missing pack file ${file.path}`);
    });
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== file.sha256) {
      throw new RulePackError(
        'RULE_PACK_HASH_MISMATCH',
        `${file.path} hash ${digest} does not match manifest`,
      );
    }
  }

  if (options.publicKeyPem) {
    if (!manifest.signature) {
      throw new RulePackError('RULE_PACK_SIGNATURE_INVALID', 'manifest is not signed');
    }
    const valid = verify(
      null,
      manifestPayload(manifest),
      options.publicKeyPem,
      Buffer.from(manifest.signature, 'base64'),
    );
    if (!valid) {
      throw new RulePackError('RULE_PACK_SIGNATURE_INVALID', 'manifest signature is invalid');
    }
  }

  const read = async (path: string): Promise<string> =>
    readFile(join(dir, ...path.split('/')), 'utf8');
  const controlsFile = parseYaml(
    await read('dpdpa-controls.yaml'),
    'dpdpa-controls.yaml',
    controlsFileSchema,
  );
  const scoringFile = parseYaml(await read('scoring.yaml'), 'scoring.yaml', scoringFileSchema);
  const suppressionsFile = parseYaml(
    await read('suppressions.yaml'),
    'suppressions.yaml',
    suppressionsFileSchema,
  );

  const controls: Control[] = controlsFile.controls.map((control) => ({
    ...control,
    tags: control.tags ?? [],
  }));
  const controlsByCode = new Map(controls.map((control) => [control.code, control]));

  const mappings: Mapping[] = [];
  const seen = new Set<string>();
  for (const path of present.filter((path) => path.startsWith('mappings/'))) {
    const file = parseYaml(await read(path), path, mappingsFileSchema);
    assertPack(file.pack, controlsFile.pack, path);
    for (const mapping of file.mappings) {
      if (!controlsByCode.has(mapping.control)) {
        throw new RulePackError(
          'RULE_PACK_INVALID',
          `${path} maps ${mapping.ruleId} to unknown control ${mapping.control}`,
        );
      }
      const key = `${mapping.scanner}|${mapping.ruleId}|${mapping.scannerRuleVersion}|${mapping.control}`;
      if (seen.has(key)) {
        throw new RulePackError('RULE_PACK_INVALID', `duplicate mapping ${key}`);
      }
      seen.add(key);
      mappings.push({
        scanner: mapping.scanner,
        ruleId: mapping.ruleId,
        scannerRuleVersion: mapping.scannerRuleVersion ?? '*',
        controlCode: mapping.control,
        confidence: mapping.confidence,
        rationale: mapping.rationale,
        remediationTemplate: mapping.remediationTemplate ?? null,
      });
    }
  }
  if (mappings.length === 0) {
    throw new RulePackError('RULE_PACK_INVALID', 'pack has no mappings');
  }
  for (const suppression of suppressionsFile.suppressions) {
    for (const code of suppression.controls) {
      if (!controlsByCode.has(code)) {
        throw new RulePackError(
          'RULE_PACK_INVALID',
          `suppression ${suppression.id} references unknown control ${code}`,
        );
      }
    }
  }
  assertPack(scoringFile.pack, controlsFile.pack, 'scoring.yaml');
  assertPack(suppressionsFile.pack, controlsFile.pack, 'suppressions.yaml');

  return {
    pack: controlsFile.pack,
    effectiveFrom: controlsFile.effectiveFrom,
    scoringVersion: scoringFile.scoringVersion,
    controls,
    controlsByCode,
    mappings,
    suppressions: suppressionsFile.suppressions.map((suppression) => ({
      ...suppression,
      matchHashes: suppression.matchHashes ?? [],
    })),
    sectionWeights: scoringFile.sectionWeights,
    grades: scoringFile.grades,
  };
}

/** Canonical signed payload: pack name, then `<sha256>  <path>` sorted by path. */
export function manifestPayload(manifest: Manifest): Buffer {
  const files = [...manifest.files].sort((a, b) => (a.path < b.path ? -1 : 1));
  const body = files.map((file) => `${file.sha256}  ${file.path}`).join('\n');
  return Buffer.from(`pack:${manifest.pack}\n${body}\n`, 'utf8');
}

/** Builds a manifest from the files on disk. Used by the pack generator and tests. */
export async function buildManifest(
  dir: string,
  meta: { pack: string; generatedAt: string },
): Promise<Manifest> {
  const paths = (await listYaml(dir)).filter((path) => path !== MANIFEST);
  const files = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(join(dir, ...path.split('/'))))
        .digest('hex'),
    })),
  );
  return { version: 1, pack: meta.pack, generatedAt: meta.generatedAt, files };
}

export function stringifyManifest(manifest: Manifest): string {
  return stringify(manifest);
}

async function listYaml(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listYaml(full, base)));
    } else if (/\.ya?ml$/.test(entry.name)) {
      files.push(relative(base, full).split(sep).join('/'));
    }
  }
  return files.sort();
}

function parseYaml<S extends z.ZodType>(raw: string, path: string, schema: S): z.infer<S> {
  let value: unknown;
  try {
    value = parse(raw);
  } catch (error) {
    throw new RulePackError('RULE_PACK_INVALID', `${path}: ${(error as Error).message}`);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new RulePackError('RULE_PACK_INVALID', `${path}: ${issues}`);
  }
  return result.data;
}

function assertPack(actual: string, expected: string, path: string): void {
  if (actual !== expected) {
    throw new RulePackError(
      'RULE_PACK_INVALID',
      `${path} belongs to pack ${actual}, expected ${expected}`,
    );
  }
}
