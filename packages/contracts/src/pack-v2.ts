import { z } from 'zod';
import { CONTROL_CODE_PATTERN } from './fingerprint';
import { readinessConfidenceSchema } from './readiness';

export const DPDPA_PACK_V2_VERSION = 'dpdpa-2026.11.0';
export const INVENTORY_V1_VERSION = 'inventory-1.0.0';

export const SECTION_REF_PATTERN = /^\d+(?:\(\d+\))?$/;
export const LEGAL_REF_PATTERN =
  /^(?:DPDPA Section \d+(?:\(\d+\))?(?:\([a-z]\))?|DPDP Rules \d+(?:\([a-z]\))?)$/;
export const DETECTOR_ID_PATTERN = /^[a-z][a-z0-9_]{2,48}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_.:/-]{1,120}$/;
export const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*\.\.)[^\0]{1,240}$/;

const detectorId = z.string().regex(DETECTOR_ID_PATTERN);
const token = z.string().regex(TOKEN_PATTERN);
const relativePath = z.string().regex(RELATIVE_PATH_PATTERN);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime();
const uuid = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const ruleId = z.string().regex(/^[a-z0-9_.-]{1,64}$/);

export const INVENTORY_MODULE_KEYS = [
  'schema_scan',
  'form_scan',
  'mechanism_scan',
  'artefact_scan',
  'dep_scan',
  'sdk_init_scan',
  'region_scan',
  'pii_literal_scan',
  'cookie_scan',
  'cmp_scan',
  'header_scan',
  'cms_scan',
] as const;

export const inventorySignalSchema = z
  .object({
    detector: detectorId,
    kind: z.enum([
      'file',
      'symbol',
      'field',
      'route',
      'dependency',
      'config',
      'artefact',
      'region',
      'cookie',
      'header',
    ]),
    path: relativePath,
    line: z.number().int().positive().max(100_000).nullable(),
    token,
    count: z.number().int().nonnegative().max(100_000).nullable().optional(),
  })
  .strict();
export type InventorySignal = z.infer<typeof inventorySignalSchema>;

export const inventoryFactSchema = z
  .object({
    key: z.enum(INVENTORY_MODULE_KEYS),
    signals: z.array(inventorySignalSchema).max(2000),
    detectedAt: isoDateTime,
  })
  .strict();
export type InventoryFact = z.infer<typeof inventoryFactSchema>;

export const ruleProvenanceSchema = z
  .object({
    search: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9_.:/-]+$/),
    token: token.optional(),
    pathHint: relativePath.optional(),
  })
  .strict();

export const violationRuleSchema = z
  .object({
    id: ruleId,
    detector: detectorId,
    provenance: ruleProvenanceSchema,
    confidence: readinessConfidenceSchema,
  })
  .strict();

export const absenceRuleSchema = z
  .object({
    id: ruleId,
    detector: detectorId,
    token,
    pathHint: relativePath.optional(),
    confidence: readinessConfidenceSchema,
  })
  .strict();

export const positiveRuleSchema = z
  .object({
    id: ruleId,
    detector: detectorId,
    token,
    pathHint: relativePath.optional(),
    confidence: readinessConfidenceSchema,
  })
  .strict();

export const EVIDENCE_MODES = [
  'absence',
  'positive',
  'violation',
  'manual',
  'attestation',
] as const;
export const evidenceModeSchema = z.enum(EVIDENCE_MODES);

export const controlV2Schema = z
  .object({
    code: z.string().regex(CONTROL_CODE_PATTERN),
    section: z.string().regex(SECTION_REF_PATTERN),
    actRef: z.string().regex(LEGAL_REF_PATTERN),
    ruleRef: ruleId,
    title: z.string().min(1).max(200),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    weight: z.number().int().min(1).max(10),
    evidenceMode: evidenceModeSchema,
    appliesWhen: z
      .array(z.object({ language: token.optional(), stack: token.optional() }).strict())
      .max(32),
    violationRules: z.array(violationRuleSchema).max(32),
    absenceRules: z.array(absenceRuleSchema).max(32),
    positiveRules: z.array(positiveRuleSchema).max(32),
    partialCredit: z.boolean(),
    remediationKey: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    legalRefs: z.array(z.string().regex(LEGAL_REF_PATTERN)).min(1).max(8),
  })
  .strict();
export type ControlV2 = z.infer<typeof controlV2Schema>;

export const detectorV2Schema = z
  .object({
    id: detectorId,
    module: detectorId,
    inputs: z
      .array(z.enum(['source', 'dependencies', 'config', 'artefacts', 'headers', 'runtime']))
      .min(1)
      .max(8),
    outputs: z
      .array(z.enum(['fact', 'signal', 'finding', 'status']))
      .min(1)
      .max(8),
    timeoutMs: z.number().int().min(100).max(120_000),
    stacks: z.array(token).max(32),
    confidence: readinessConfidenceSchema,
    failureMode: z.enum(['UNKNOWN', 'FAIL_CLOSED']),
    controlRefs: z.array(z.string().regex(CONTROL_CODE_PATTERN)).max(64),
  })
  .strict();
export type DetectorV2 = z.infer<typeof detectorV2Schema>;

export const attestationSchema = z
  .object({
    orgId: uuid,
    repositoryId: uuid,
    key: z.string().regex(/^[a-z][a-z0-9_.:-]{2,96}$/),
    answer: z.boolean(),
    note: z.string().max(2000).nullable().optional(),
    attestedBy: uuid,
    attestedAt: isoDateTime,
    expiresAt: isoDateTime.nullable().optional(),
  })
  .strict();
export type Attestation = z.infer<typeof attestationSchema>;

export const packManifestV2Schema = z
  .object({
    version: z.literal(1),
    pack: z.literal(DPDPA_PACK_V2_VERSION),
    generatedAt: isoDateTime,
    files: z
      .array(
        z
          .object({
            path: z.string().regex(/^[A-Za-z0-9_./-]{1,240}$/),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const commencementEntrySchema = z
  .object({
    provision: z.string().regex(LEGAL_REF_PATTERN),
    effectiveFrom: isoDate,
    sourceUrl: z.string().regex(/^https:\/\/[^\s]{1,290}$/),
    verifiedOn: isoDate,
  })
  .strict();

export const commencementFileSchema = z
  .object({
    version: z.literal(1),
    pack: z.literal(DPDPA_PACK_V2_VERSION),
    entries: z.array(commencementEntrySchema).min(1).max(32),
  })
  .strict();

export const catalogFileSchema = z
  .object({
    version: z.literal(1),
    pack: z.literal(DPDPA_PACK_V2_VERSION),
    entries: z.array(z.object({ key: token, label: z.string().min(1).max(200) }).strict()).max(500),
  })
  .strict();

export const mappingsFileV2Schema = z
  .object({
    version: z.literal(1),
    pack: z.literal(DPDPA_PACK_V2_VERSION),
    mappings: z
      .array(
        z
          .object({
            detector: detectorId,
            control: z.string().regex(CONTROL_CODE_PATTERN),
            confidence: readinessConfidenceSchema,
            rationale: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const controlsFileV2Schema = z
  .object({
    version: z.literal(1),
    pack: z.literal(DPDPA_PACK_V2_VERSION),
    effectiveFrom: isoDate,
    controls: z.array(controlV2Schema).max(200),
  })
  .strict();

export const detectorsFileV2Schema = z
  .object({
    version: z.literal(1),
    pack: z.literal(DPDPA_PACK_V2_VERSION),
    detectors: z.array(detectorV2Schema).max(200),
  })
  .strict();

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface PackFileV2 {
  path: string;
  value: unknown;
  sha256: string;
}

const FORBIDDEN_KEYS = new Set(['snippet', 'value', 'content', 'context', 'raw', 'match']);

function walkKeys(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, path, issues);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      issues.push({
        path,
        code: 'source_content_field',
        message: `field '${key}' is not permitted in the pack`,
      });
    }
    walkKeys(child, path, issues);
  }
}

function collectRawMissingLegalRefs(file: PackFileV2, issues: ValidationIssue[]): void {
  const value = file.value as { controls?: unknown } | null;
  if (!value || !Array.isArray(value.controls)) return;
  for (const entry of value.controls) {
    if (!entry || typeof entry !== 'object') continue;
    const control = entry as { legalRefs?: unknown };
    if (Array.isArray(control.legalRefs) && control.legalRefs.length === 0) {
      issues.push({
        path: file.path,
        code: 'missing_legal_ref',
        message: 'control has no legal reference',
      });
    }
  }
}

function issueMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
    .slice(0, 500);
}

function check<S extends z.ZodType>(
  file: PackFileV2,
  schema: S,
  code: string,
  issues: ValidationIssue[],
): z.infer<S> | undefined {
  const result = schema.safeParse(file.value);
  if (result.success) return result.data;
  issues.push({ path: file.path, code, message: issueMessage(result.error) });
  return undefined;
}

/**
 * Pure v2 pack validation. Callers supply already-parsed YAML values and the
 * raw SHA-256 of each file; this function never logs or returns file contents.
 */
export function validatePackV2(input: {
  files: PackFileV2[];
  manifest: unknown;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const manifest = packManifestV2Schema.safeParse(input.manifest);
  if (!manifest.success) {
    return [
      { path: 'manifest.yaml', code: 'invalid_manifest', message: issueMessage(manifest.error) },
    ];
  }

  const manifestHashes = new Map(manifest.data.files.map((file) => [file.path, file.sha256]));
  const provided = new Map(input.files.map((file) => [file.path, file]));

  for (const file of input.files) {
    if (!manifestHashes.has(file.path)) {
      issues.push({
        path: file.path,
        code: 'unknown_file',
        message: 'file is not listed in manifest',
      });
    } else if (manifestHashes.get(file.path) !== file.sha256) {
      issues.push({
        path: file.path,
        code: 'checksum_mismatch',
        message: 'file checksum does not match manifest',
      });
    }
  }
  for (const path of manifestHashes.keys()) {
    if (!provided.has(path)) {
      issues.push({ path, code: 'missing_file', message: 'manifest file is not present on disk' });
    }
  }

  const controls: ControlV2[] = [];
  const detectors: DetectorV2[] = [];
  const mappingDetectorIds: Array<{ path: string; detector: string }> = [];

  for (const file of input.files) {
    walkKeys(file.value, file.path, issues);
    if (file.path === 'controls.yaml') {
      collectRawMissingLegalRefs(file, issues);
      const doc = check(file, controlsFileV2Schema, 'invalid_schema', issues);
      if (doc) controls.push(...doc.controls);
    } else if (file.path === 'detectors.yaml') {
      const doc = check(file, detectorsFileV2Schema, 'invalid_schema', issues);
      if (doc) detectors.push(...doc.detectors);
    } else if (file.path === 'commencement.yaml') {
      const doc = check(file, commencementFileSchema, 'invalid_commencement', issues);
      if (doc) {
        for (const entry of doc.entries) {
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveFrom) ||
            Number.isNaN(new Date(entry.effectiveFrom).getTime())
          ) {
            issues.push({
              path: file.path,
              code: 'invalid_commencement',
              message: 'effectiveFrom is not a valid ISO date',
            });
          }
        }
      }
    } else if (file.path.startsWith('mappings/') && file.path.endsWith('.yaml')) {
      const doc = check(file, mappingsFileV2Schema, 'invalid_schema', issues);
      if (doc) {
        for (const mapping of doc.mappings) {
          mappingDetectorIds.push({ path: file.path, detector: mapping.detector });
        }
      }
    } else if (file.path.endsWith('.yaml')) {
      check(file, catalogFileSchema, 'invalid_schema', issues);
    } else if (file.path.startsWith('templates/') && file.path.endsWith('.md')) {
      // Checksum-bearing documentation is allowed, but it has no pack schema.
    } else {
      issues.push({
        path: file.path,
        code: 'unknown_file',
        message: 'file type is not part of the v2 pack',
      });
    }
  }

  const declaredDetectors = new Set(detectors.map((detector) => detector.id));
  const seenControls = new Set<string>();
  for (const control of controls) {
    if (seenControls.has(control.code)) {
      issues.push({
        path: 'controls.yaml',
        code: 'duplicate_control',
        message: `control ${control.code} is declared more than once`,
      });
    }
    seenControls.add(control.code);

    const referenced = [
      ...control.violationRules.map((rule) => rule.detector),
      ...control.absenceRules.map((rule) => rule.detector),
      ...control.positiveRules.map((rule) => rule.detector),
    ];
    for (const detector of referenced) {
      if (!declaredDetectors.has(detector)) {
        issues.push({
          path: 'controls.yaml',
          code: 'orphan_detector',
          message: `control ${control.code} references undeclared detector ${detector}`,
        });
      }
    }

    if (
      control.evidenceMode !== 'manual' &&
      control.evidenceMode !== 'attestation' &&
      control.violationRules.length === 0 &&
      control.absenceRules.length === 0 &&
      control.positiveRules.length === 0
    ) {
      issues.push({
        path: 'controls.yaml',
        code: 'missing_rule',
        message: `control ${control.code} has no violation, absence, or positive rule`,
      });
    }
    if (control.legalRefs.length === 0) {
      issues.push({
        path: 'controls.yaml',
        code: 'missing_legal_ref',
        message: `control ${control.code} has no legal reference`,
      });
    }
  }

  for (const mapping of mappingDetectorIds) {
    if (!declaredDetectors.has(mapping.detector)) {
      issues.push({
        path: mapping.path,
        code: 'orphan_detector',
        message: `mapping references undeclared detector ${mapping.detector}`,
      });
    }
  }

  const unique = new Map(
    issues.map((issue) => [`${issue.path}|${issue.code}|${issue.message}`, issue] as const),
  );
  return [...unique.values()].sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );
}
