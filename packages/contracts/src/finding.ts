import { z } from 'zod';
import { FINGERPRINT_PATTERN } from './fingerprint';

/** Scanner severity after normalisation (rules.md §7.3). */
export const FINDING_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

const SHA256_EVIDENCE_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Normalised finding contract (rules.md §7.1).
 *
 * Pipeline rules that are validated here:
 * - `filePath` is relative, POSIX-separated, and never escapes the repository root.
 * - `lineStart`/`lineEnd` are positive integers and ordered (`lineEnd >= lineStart`).
 * - `message` is capped at 2,000 characters (truncation/HTML stripping happen in the runner).
 * - `evidenceHash` is salted per-scan (`sha256:<64 hex>`); `fingerprint` is salt-free (§8).
 */
export const normalisedFindingSchema = z
  .object({
    scanner: z.string().min(1),
    scannerRuleId: z.string().min(1),
    scannerRuleVersion: z.string().min(1),
    scannerSeverity: z.enum(FINDING_SEVERITIES),
    filePath: z
      .string()
      .min(1)
      .superRefine((value, ctx) => {
        const escapesRoot =
          value.startsWith('/') || value.includes('\\') || value.split('/').includes('..');
        if (escapesRoot) {
          ctx.addIssue({
            code: 'custom',
            message:
              'filePath must be relative, POSIX-separated, and never escape the repository root.',
          });
        }
      }),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    message: z.string().max(2000),
    evidenceRedacted: z.string(),
    evidenceHash: z.string().regex(SHA256_EVIDENCE_PATTERN),
    fingerprint: z.string().regex(FINGERPRINT_PATTERN),
    context: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((finding, ctx) => {
    if (finding.lineEnd < finding.lineStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['lineEnd'],
        message: 'lineEnd must be greater than or equal to lineStart.',
      });
    }
  });

export type NormalisedFinding = z.infer<typeof normalisedFindingSchema>;
