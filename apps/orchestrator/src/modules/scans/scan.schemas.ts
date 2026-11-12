import { z } from 'zod';

/** docs/api.md §3.1: `standard` runs every scanner, `secrets-only` skips SAST/IaC. */
export const scanProfileSchema = z.enum(['standard', 'secrets-only']);
export type ScanProfile = z.infer<typeof scanProfileSchema>;

/** Statuses that mean "a scan is running" (api.md §3.1, §5.5). */
export const ACTIVE_SCAN_STATUSES = ['queued', 'cloning', 'scanning', 'mapping'] as const;
export type ActiveScanStatus = (typeof ACTIVE_SCAN_STATUSES)[number];

export const scanStatusSchema = z.enum([
  'queued',
  'cloning',
  'scanning',
  'mapping',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
export type ScanStatusValue = z.infer<typeof scanStatusSchema>;

export const scannerNameSchema = z.enum(['semgrep', 'checkov', 'gitleaks']);
export type ScannerNameValue = z.infer<typeof scannerNameSchema>;

export const scannerStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'timed_out',
  'skipped',
]);

export const findingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

/** Branch, tag, or a full commit SHA (40 hex, or 64 for SHA-256 repos). */
const REF_PATTERN = /^(?:[A-Za-z0-9._/-]{1,255}|[0-9a-f]{40}|[0-9a-f]{64})$/;

export const createScanSchema = z
  .strictObject({
    orgId: z.uuid(),
    repositoryId: z.uuid().optional(),
    githubUrl: z.string().trim().min(1).max(2048).optional(),
    requestedBy: z.uuid().nullable().optional(),
    apiKeyId: z.uuid().nullable().optional(),
    ref: z
      .string()
      .trim()
      .regex(REF_PATTERN, 'Enter a valid branch, tag, or commit SHA.')
      .max(255)
      .optional(),
    profile: scanProfileSchema.default('standard'),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
    requestId: z.string().trim().max(64).optional(),
  })
  .refine(
    (value) => (value.repositoryId === undefined) !== (value.githubUrl === undefined),
    'Provide exactly one of repositoryId or githubUrl.',
  );
export type CreateScanInput = z.input<typeof createScanSchema>;
export type CreateScan = z.output<typeof createScanSchema>;

export const listScansSchema = z.strictObject({
  orgId: z.uuid(),
  repositoryId: z.uuid().optional(),
  status: z.array(scanStatusSchema).max(8).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', '-createdAt', 'score', '-score']).default('-createdAt'),
});
export type ListScansInput = z.input<typeof listScansSchema>;

export const cancelScanSchema = z.strictObject({
  orgId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type CancelScanInput = z.input<typeof cancelScanSchema>;

/** api.md §10.4: one runner batch. */
export const findingInputSchema = z.strictObject({
  scannerRuleId: z.string().min(1).max(512),
  scannerRuleVersion: z.string().max(64).optional(),
  severity: findingSeveritySchema,
  filePath: z.string().max(1024).optional(),
  lineStart: z.number().int().nonnegative().optional(),
  lineEnd: z.number().int().nonnegative().optional(),
  message: z.string().min(1).max(4096),
  evidenceRedacted: z.string().max(4096).optional(),
  evidenceHash: z.string().max(128).optional(),
  fingerprint: z.string().min(1).max(128),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const findingsBatchSchema = z.strictObject({
  batchId: z.string().min(1).max(128),
  scanner: scannerNameSchema,
  scannerVersion: z.string().min(1).max(64),
  findings: z.array(findingInputSchema).max(1000),
});
export type FindingsBatchInput = z.input<typeof findingsBatchSchema>;
export type FindingsBatch = z.output<typeof findingsBatchSchema>;

/** api.md §10.5: per-scanner completion report. */
export const scannerReportSchema = z.strictObject({
  name: scannerNameSchema,
  status: scannerStatusSchema,
  version: z.string().max(64).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  findings: z.number().int().nonnegative().default(0),
});

export const completeScanSchema = z.strictObject({
  scanners: z.array(scannerReportSchema).min(1).max(3),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/, 'commitSha must be a 40-character lowercase hex SHA.')
    .optional(),
  workspaceBytes: z.number().int().nonnegative().optional(),
});
export type CompleteScanInput = z.input<typeof completeScanSchema>;
export type CompleteScan = z.output<typeof completeScanSchema>;
