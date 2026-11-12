import { z } from 'zod';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'direct' | 'inferred' | 'advisory';
export type Scanner = 'semgrep' | 'checkov' | 'gitleaks';

export interface PredicateLeaf {
  language?: string | undefined;
  framework?: string | undefined;
  resourceType?: string | undefined;
}

export type Predicate = { any: Predicate[] } | { all: Predicate[] } | PredicateLeaf;

export interface Control {
  code: string;
  section: string;
  title: string;
  summary: string;
  obligation: string;
  legalReference: string;
  severity: Severity;
  weight: number;
  evidenceStrength: Confidence;
  scored: boolean;
  appliesWhen: Predicate;
  remediation: string;
  tags: string[];
}

export interface Mapping {
  scanner: Scanner;
  ruleId: string;
  scannerRuleVersion: string;
  controlCode: string;
  confidence: Confidence;
  rationale: string;
  remediationTemplate: string | null;
}

export interface Suppression {
  id: string;
  paths: string[];
  scanners: Scanner[];
  controls: string[];
  matchHashes: string[];
  reason: string;
  reviewedBy: string;
  expiresAt: string;
}

export interface GradeBand {
  grade: string;
  min: number;
  max: number;
}

export interface ManifestFile {
  path: string;
  sha256: string;
}

export interface Manifest {
  version: number;
  pack: string;
  generatedAt: string;
  files: ManifestFile[];
  signature?: string | undefined;
  publicKeyId?: string | undefined;
}

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const confidenceSchema = z.enum(['direct', 'inferred', 'advisory']);
export const scannerSchema = z.enum(['semgrep', 'checkov', 'gitleaks']);

const controlCodeSchema = z.string().regex(/^DPDPA-\d+(?:\.\d+)?-[A-Z]+-\d{2}$/);
const packNameSchema = z.string().regex(/^dpdpa-\d{4}\.\d{2}\.\d+$/);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.strictObject({}),
    z.strictObject({ any: z.array(predicateSchema).min(1) }),
    z.strictObject({ all: z.array(predicateSchema).min(1) }),
    z
      .strictObject({
        language: z.string().min(1).optional(),
        framework: z.string().min(1).optional(),
        resourceType: z.string().min(1).optional(),
      })
      .refine((leaf) => Object.keys(leaf).length > 0, 'predicate leaf needs at least one fact'),
  ]),
);

const controlSchema = z.strictObject({
  code: controlCodeSchema,
  section: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  obligation: z.string().min(1),
  legalReference: z.string().min(1),
  severity: severitySchema,
  weight: z.number().nonnegative(),
  evidenceStrength: confidenceSchema,
  scored: z.boolean(),
  appliesWhen: predicateSchema,
  remediation: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
});

export const controlsFileSchema = z
  .strictObject({
    version: z.literal(1),
    pack: packNameSchema,
    effectiveFrom: isoDateSchema,
    controls: z.array(controlSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const control of file.controls) {
      if (seen.has(control.code)) {
        ctx.addIssue({ code: 'custom', message: `duplicate control ${control.code}` });
      }
      seen.add(control.code);
    }
  });

const mappingSchema = z.strictObject({
  scanner: scannerSchema,
  ruleId: z.string().min(1),
  scannerRuleVersion: z.string().min(1).default('*'),
  control: controlCodeSchema,
  confidence: confidenceSchema,
  rationale: z.string().min(10),
  remediationTemplate: z.string().min(1).optional(),
});

export const mappingsFileSchema = z.strictObject({
  version: z.literal(1),
  pack: packNameSchema,
  mappings: z.array(mappingSchema).min(1),
});

const suppressionSchema = z
  .strictObject({
    id: z.string().min(1),
    paths: z.array(z.string().min(1)).min(1),
    scanners: z.array(scannerSchema).min(1),
    controls: z.array(controlCodeSchema).min(1),
    matchHashes: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).default([]),
    reason: z.string().min(20),
    reviewedBy: z.string().email(),
    expiresAt: isoDateSchema,
  })
  .superRefine((suppression, ctx) => {
    // rules.md §5.3: a path glob alone must never suppress a secret.
    const targetsSecrets =
      suppression.scanners.includes('gitleaks') ||
      suppression.controls.includes('DPDPA-8.4-SECRET-01');
    if (targetsSecrets && suppression.matchHashes.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: `suppression ${suppression.id} targets secrets without a hash scope`,
      });
    }
  });

export const suppressionsFileSchema = z.strictObject({
  version: z.literal(1),
  pack: packNameSchema,
  suppressions: z.array(suppressionSchema),
});

const gradeBandSchema = z
  .strictObject({
    grade: z.string().regex(/^[A-F]$/),
    min: z.number().min(0).max(100),
    max: z.number().min(0).max(100),
  })
  .refine((band) => band.min <= band.max, 'grade band min must not exceed max');

export const scoringFileSchema = z
  .strictObject({
    version: z.literal(1),
    pack: packNameSchema,
    scoringVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    sectionWeights: z.record(z.string().min(1), z.number().nonnegative()),
    grades: z.array(gradeBandSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const bands = [...file.grades].sort((a, b) => b.min - a.min);
    if (bands[0]?.max !== 100) {
      ctx.addIssue({ code: 'custom', message: 'grade bands must start at 100' });
    }
    if (bands[bands.length - 1]?.min !== 0) {
      ctx.addIssue({ code: 'custom', message: 'grade bands must end at 0' });
    }
    for (let i = 0; i < bands.length - 1; i += 1) {
      const upper = bands[i];
      const lower = bands[i + 1];
      if (!upper || !lower) continue;
      if (Math.abs(lower.max + 0.01 - upper.min) > 1e-9) {
        ctx.addIssue({ code: 'custom', message: 'grade bands must be contiguous' });
      }
    }
  });

export const manifestSchema = z.strictObject({
  version: z.literal(1),
  pack: packNameSchema,
  generatedAt: z.string().min(1),
  files: z.array(z.strictObject({ path: z.string().min(1), sha256: sha256HexSchema })).min(1),
  signature: z.string().min(1).optional(),
  publicKeyId: z.string().min(1).optional(),
});

export { controlCodeSchema, packNameSchema, sha256HexSchema };
