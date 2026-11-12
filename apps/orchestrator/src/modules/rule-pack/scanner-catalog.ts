import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Mapping } from './rule-pack.schemas.js';

export interface ScannerCatalog {
  pack: string;
  scanners: Record<string, { version: string; rules: readonly string[] }>;
}

export const SCANNER_CATALOG = 'scanner-catalog.json';

/**
 * P4-13. The catalog is the reviewed set of scanner rule IDs for the pinned
 * scanner releases. A mapping may only reference a catalogued ID, so a typo, a
 * renamed scanner rule, or an unreviewed addition fails CI instead of silently
 * becoming an unmapped finding in production.
 *
 * The catalog is hand-maintained because the pinned scanner binaries are not
 * available in the test job. Refresh it from the scanner release notes (or from
 * `semgrep --list-rules` / `checkov --list` / `gitleaks --list`) when upgrading.
 */
export function validateCatalog(mappings: readonly Mapping[], catalog: ScannerCatalog): string[] {
  const violations: string[] = [];
  for (const mapping of mappings) {
    const scanner = catalog.scanners[mapping.scanner];
    if (!scanner) {
      violations.push(`unknown scanner: ${mapping.scanner}`);
      continue;
    }
    if (!scanner.rules.includes(mapping.ruleId)) {
      violations.push(`unknown ${mapping.scanner} rule: ${mapping.ruleId}`);
    }
    if (mapping.scannerRuleVersion !== '*' && mapping.scannerRuleVersion !== scanner.version) {
      violations.push(
        `unpinned ${mapping.scanner} version for ${mapping.ruleId}: ` +
          `${mapping.scannerRuleVersion} (catalog ${scanner.version})`,
      );
    }
  }
  return violations;
}

export async function loadScannerCatalog(dir: string): Promise<ScannerCatalog> {
  const path = join(dir, SCANNER_CATALOG);
  const raw = await readFile(path, 'utf8');
  try {
    return JSON.parse(raw) as ScannerCatalog;
  } catch (error) {
    // The catalog is a CI artifact: name the file so a malformed edit is
    // obvious in the job log instead of surfacing as a bare SyntaxError.
    throw new Error(`scanner catalog ${path} is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
}
