import { createHash } from 'node:crypto';

/**
 * Frozen fingerprint algorithm version (rules.md §8).
 * Changing the inputs or hash requires bumping this constant and every stored fingerprint.
 */
export const FINGERPRINT_VERSION = 1;

/** Control catalogue code format: `DPDPA-<section>-<domain>-<sequence>` (rules.md §4). */
export const CONTROL_CODE_PATTERN = /^DPDPA-[0-9]+(?:\.[0-9]+)?-[A-Z0-9]+-[0-9]+$/;

/** A stored fingerprint: `fpt_<sha256 hex>` with an optional `:controlCode` fan-out suffix. */
export const FINGERPRINT_PATTERN =
  /^fpt_[0-9a-f]{64}(?::DPDPA-[0-9]+(?:\.[0-9]+)?-[A-Z0-9]+-[0-9]+)?$/;

export interface FingerprintInput {
  scanner: string;
  scannerRuleId: string;
  normalisedPath: string;
  /** sha256 of the normalised matched snippet, computed WITHOUT the per-scan salt (§8). */
  snippetHash: string;
  /** Disambiguates identical matches in the same file. */
  occurrenceIndex: number;
  /** Present only on fan-out findings: each mapped control gets its own fingerprint. */
  controlCode?: string;
}

/**
 * Deterministic finding identity (rules.md §8):
 *
 * ```text
 * base = sha256(scanner | scannerRuleId | normalisedPath | snippetHash | occurrenceIndex)
 * fingerprint = controlCode ? base + ":" + controlCode : base
 * ```
 *
 * Line numbers are deliberately excluded so a finding survives code moving down the file.
 * `fingerprintVersion` is pinned at {@link FINGERPRINT_VERSION}.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const base = createHash('sha256')
    .update(
      [
        input.scanner,
        input.scannerRuleId,
        input.normalisedPath,
        input.snippetHash,
        String(input.occurrenceIndex),
      ].join('|'),
    )
    .digest('hex');
  const fingerprint = `fpt_${base}`;
  return input.controlCode === undefined ? fingerprint : `${fingerprint}:${input.controlCode}`;
}
