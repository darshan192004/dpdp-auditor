import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import {
  DPDPA_PACK_V2_VERSION,
  controlsFileV2Schema,
  detectorsFileV2Schema,
  mappingsFileV2Schema,
  packManifestV2Schema,
  validatePackV2,
  type ControlV2,
  type PackFileV2,
} from '@dpdpa/contracts';
import { RulePackError, type InventoryRule, type LoadedRulePack } from './rule-pack.loader.js';
import {
  scoringFileSchema,
  type DetectorName,
  type Mapping,
  type Predicate,
} from './rule-pack.schemas.js';

const MANIFEST = 'manifest.yaml';

export type RulePackV2ErrorCode =
  'RULE_PACK_MISSING' | 'RULE_PACK_INVALID' | 'RULE_PACK_HASH_MISMATCH';

export class RulePackV2Error extends RulePackError {
  constructor(
    readonly v2Code: RulePackV2ErrorCode,
    message: string,
  ) {
    super(v2Code, message);
    this.name = 'RulePackV2Error';
  }
}

export type LoadedRulePackV2 = LoadedRulePack & {
  attestationsByKey: Map<string, ControlV2[]>;
};

/** Loads the checksummed v2 pack and adapts it to the Phase A scorer shape. */
export async function loadRulePackV2(
  packDir: string,
  legacyPackDir = join(packDir, '..'),
): Promise<LoadedRulePackV2> {
  const rawManifest = await readFile(join(packDir, MANIFEST), 'utf8').catch(() => {
    throw new RulePackV2Error('RULE_PACK_MISSING', `missing ${MANIFEST} in ${packDir}`);
  });
  const manifest = packManifestV2Schema.parse(parse(rawManifest));
  const paths = await listFiles(packDir);
  const files: PackFileV2[] = [];
  for (const path of paths) {
    if (path === MANIFEST) continue;
    const bytes = await readFile(join(packDir, ...path.split('/')));
    const value = path.endsWith('.yaml') ? parse(bytes.toString('utf8')) : undefined;
    files.push({ path, value, sha256: createHash('sha256').update(bytes).digest('hex') });
  }

  const knownHashes = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  for (const file of files) {
    if (knownHashes.get(file.path) !== file.sha256) {
      throw new RulePackV2Error(
        'RULE_PACK_HASH_MISMATCH',
        `${file.path} hash does not match the v2 manifest`,
      );
    }
  }

  const issues = validatePackV2({ files, manifest });
  if (issues.length > 0) {
    throw new RulePackV2Error(
      'RULE_PACK_INVALID',
      issues.map((issue) => `${issue.path}: ${issue.code}: ${issue.message}`).join('; '),
    );
  }

  const byPath = new Map(files.map((file) => [file.path, file.value]));
  const controlsFile = controlsFileV2Schema.parse(byPath.get('controls.yaml'));
  detectorsFileV2Schema.parse(byPath.get('detectors.yaml'));
  const mappingFiles = files
    .filter((file) => file.path.startsWith('mappings/') && file.path.endsWith('.yaml'))
    .map((file) => mappingsFileV2Schema.parse(file.value));

  const attestationsByKey = new Map<string, ControlV2[]>();
  for (const control of controlsFile.controls) {
    if (control.attestationKey === undefined) continue;
    const mapped = attestationsByKey.get(control.attestationKey) ?? [];
    mapped.push(control);
    attestationsByKey.set(control.attestationKey, mapped);
  }

  const controls = controlsFile.controls.map(toControl);
  const mappings: Mapping[] = [];
  const inventoryRules: InventoryRule[] = [];
  const seenMappings = new Set<string>();

  for (const file of mappingFiles) {
    for (const mapping of file.mappings) {
      const key = `${mapping.detector}|${mapping.control}`;
      if (seenMappings.has(key)) continue;
      seenMappings.add(key);
      mappings.push({
        scanner: mapping.detector as DetectorName,
        ruleId: `${mapping.detector}.${mapping.control}`,
        scannerRuleVersion: 'inventory-1.0.0',
        controlCode: mapping.control,
        confidence: mapping.confidence,
        rationale: mapping.rationale,
        remediationTemplate: null,
      });
    }
  }
  for (const control of controlsFile.controls) {
    for (const rule of control.absenceRules) {
      inventoryRules.push({
        controlCode: control.code,
        detector: rule.detector,
        token: rule.token,
        mode: 'absence',
        confidence: rule.confidence,
        ...(rule.pathHint === undefined ? {} : { pathHint: rule.pathHint }),
      });
    }
    for (const rule of control.positiveRules) {
      inventoryRules.push({
        controlCode: control.code,
        detector: rule.detector,
        token: rule.token,
        mode: 'positive',
        confidence: rule.confidence,
      });
    }
  }

  const legacy = scoringFileSchema.parse(
    parse(await readFile(join(legacyPackDir, 'scoring.yaml'), 'utf8')),
  );
  if (legacy.pack !== 'dpdpa-2026.10.6' || legacy.scoringVersion !== '1.0.0') {
    throw new RulePackV2Error('RULE_PACK_INVALID', 'legacy scoring config changed');
  }

  return {
    pack: DPDPA_PACK_V2_VERSION,
    effectiveFrom: controlsFile.effectiveFrom,
    scoringVersion: '2.0.0',
    controls,
    controlsByCode: new Map(controls.map((control) => [control.code, control])),
    attestationsByKey,
    mappings,
    suppressions: [],
    sectionWeights: legacy.sectionWeights,
    grades: legacy.grades,
    inventoryRules,
  };
}

function toControl(control: ControlV2) {
  const rules = [...control.violationRules, ...control.absenceRules, ...control.positiveRules];
  return {
    code: control.code,
    section: control.section,
    title: control.title,
    summary: control.title,
    obligation: control.actRef,
    legalReference: control.actRef,
    severity: control.severity,
    weight: control.weight,
    evidenceStrength: rules[0]?.confidence ?? 'inferred',
    scored: true,
    appliesWhen: toPredicate(control.appliesWhen),
    remediation: control.remediationKey.replaceAll('-', ' '),
    tags: [control.evidenceMode],
  };
}

function toPredicate(appliesWhen: ControlV2['appliesWhen']): Predicate {
  if (appliesWhen.length === 0) return {};
  const leaves = appliesWhen.map((entry): Predicate => {
    if (entry.stack === 'web') {
      return {
        any: [{ framework: 'web' }, { language: 'javascript' }, { language: 'typescript' }],
      };
    }
    if (entry.language !== undefined) return { language: entry.language };
    if (entry.stack !== undefined) return { framework: entry.stack };
    return {};
  });
  return leaves.length === 1 ? leaves[0]! : { any: leaves };
}

async function listFiles(root: string, base = root): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listFiles(full, base)));
    } else {
      paths.push(relative(base, full).split(sep).join('/'));
    }
  }
  return paths.sort();
}
