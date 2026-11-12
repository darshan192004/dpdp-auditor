import type { Suppression } from '../rule-pack/rule-pack.schemas.js';

export interface SuppressibleFinding {
  scanner: string;
  controlCode: string | null;
  filePath: string | null;
  evidenceHash: string | null;
}

/**
 * P4-19. Pack suppressions are deliberately narrow (rules.md §5.3, §11):
 *
 * - an expired suppression never applies;
 * - the finding must match the scanner and control;
 * - the path must match one of the globs;
 * - a secret (gitleaks) is suppressed only by an exact evidence hash. A path
 *   glob alone never hides a secret, so fixtures stay visible by default.
 */
export function isSuppressed(
  finding: SuppressibleFinding,
  suppressions: readonly Suppression[],
  now: Date = new Date(),
): boolean {
  return suppressions.some((suppression) => matches(suppression, finding, now));
}

function matches(suppression: Suppression, finding: SuppressibleFinding, now: Date): boolean {
  if (!isLive(suppression, now)) return false;
  if (!suppression.scanners.includes(finding.scanner as Suppression['scanners'][number])) {
    return false;
  }
  if (finding.controlCode === null || !suppression.controls.includes(finding.controlCode)) {
    return false;
  }
  if (finding.filePath === null) return false;
  if (!suppression.paths.some((pattern) => globMatches(pattern, finding.filePath as string))) {
    return false;
  }
  if (finding.scanner === 'gitleaks') {
    return finding.evidenceHash !== null && suppression.matchHashes.includes(finding.evidenceHash);
  }
  return true;
}

/** `expiresAt` is an ISO date; the suppression is live through that day (UTC). */
export function isLive(suppression: Suppression, now: Date): boolean {
  return now.getTime() <= Date.parse(`${suppression.expiresAt}T23:59:59.999Z`);
}

/**
 * Minimal glob matcher for pack paths: `**` crosses directories, `*` and `?`
 * stay within one segment. Backslashes are normalised so Windows paths match.
 */
export function globMatches(pattern: string, path: string): boolean {
  const source = pattern
    .replaceAll('\\', '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**/', '\u0000')
    .replaceAll('**', '\u0001')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll('\u0000', '(?:.*/)?')
    .replaceAll('\u0001', '.*');
  return new RegExp(`^${source}$`).test(path.replaceAll('\\', '/'));
}
