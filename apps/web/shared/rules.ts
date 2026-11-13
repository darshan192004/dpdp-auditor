import {
  FINDING_SCANNERS,
  type FindingConfidence,
  type FindingScanner,
  type FindingSeverity,
} from './findings';
import { SECTION_LABELS } from './scan';

/**
 * Rule-explorer view model shared by the app and Nitro (docs/api.md §7.1).
 *
 * A rule is the DPDPA control plus the scanner mappings that produce evidence
 * for it. The catalog never computes a score; it explains what each control
 * asks for and which scanner output is treated as proof.
 */

export interface RuleMapping {
  scanner: FindingScanner;
  ruleId: string;
  confidence: FindingConfidence;
  rationale: string;
}

export interface RuleView {
  code: string;
  section: string;
  title: string;
  summary: string;
  obligation: string;
  legalReference: string;
  severity: FindingSeverity;
  weight: number;
  scored: boolean;
  evidenceStrength: FindingConfidence;
  tags: string[];
  mappings: RuleMapping[];
  remediation: string;
}

export interface RulesPage {
  data: RuleView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export const SCANNER_LABELS: Record<FindingScanner, string> = {
  semgrep: 'Semgrep',
  checkov: 'Checkov',
  gitleaks: 'Gitleaks',
};

/** `8(4)` -> `DPDPA-8.4-`; the control code carries its section prefix. */
export function sectionCodePrefix(section: string): string {
  return `DPDPA-${section.replace('(', '.').replaceAll(')', '')}-`;
}

export function codeMatchesSection(code: string, section: string): boolean {
  return code.startsWith(sectionCodePrefix(section));
}

export interface RulesQuery {
  section: string | null;
  scanner: FindingScanner | null;
}

/** Unknown values are ignored rather than rejected: a stale link still works. */
export function parseRulesQuery(raw: Record<string, unknown>): RulesQuery {
  const section = typeof raw.section === 'string' ? raw.section.trim().slice(0, 16) : '';
  const scanner = typeof raw.scanner === 'string' ? raw.scanner : '';
  return {
    section: section === '' ? null : section,
    scanner: (FINDING_SCANNERS as readonly string[]).includes(scanner)
      ? (scanner as FindingScanner)
      : null,
  };
}

export function rulesUrl(query: RulesQuery): string {
  const params = new URLSearchParams();
  if (query.section !== null) params.set('section', query.section);
  if (query.scanner !== null) params.set('scanner', query.scanner);
  const search = params.toString();
  return `/app/rules${search === '' ? '' : `?${search}`}`;
}

const SECTION_ORDER = Object.keys(SECTION_LABELS);

/**
 * Pack order is not guaranteed once a filter is applied, so the catalog sorts
 * by the legal section order and then by control code.
 */
export function sortRules(rules: readonly RuleView[]): RuleView[] {
  const rank = (section: string): number => {
    const index = SECTION_ORDER.indexOf(section);
    return index === -1 ? SECTION_ORDER.length : index;
  };
  return [...rules].sort(
    (a, b) => rank(a.section) - rank(b.section) || a.code.localeCompare(b.code),
  );
}

/** The same filter the API applies, so the explorer can filter one page locally. */
export function filterRules(rules: readonly RuleView[], query: RulesQuery): RuleView[] {
  return rules.filter(
    (rule) =>
      (query.section === null || rule.section === query.section) &&
      (query.scanner === null || rule.mappings.some((map) => map.scanner === query.scanner)),
  );
}

export interface RuleSectionOption {
  section: string;
  label: string;
  count: number;
}

/** Sections present in the catalog, in legal order, with their control counts. */
export function ruleSections(rules: readonly RuleView[]): RuleSectionOption[] {
  const counts = new Map<string, number>();
  for (const rule of rules) {
    counts.set(rule.section, (counts.get(rule.section) ?? 0) + 1);
  }

  const known = SECTION_ORDER.filter((section) => counts.has(section));
  const unknown = [...counts.keys()]
    .filter((section) => !SECTION_ORDER.includes(section))
    .sort((a, b) => a.localeCompare(b));

  return [...known, ...unknown].map((section) => ({
    section,
    label: ruleSectionLabel(section),
    count: counts.get(section) ?? 0,
  }));
}

/** A rule counts for a scanner when at least one of its mappings uses it. */
export function ruleScannerCounts(rules: readonly RuleView[]): Record<FindingScanner, number> {
  const counts: Record<FindingScanner, number> = { semgrep: 0, checkov: 0, gitleaks: 0 };
  for (const rule of rules) {
    for (const scanner of new Set(rule.mappings.map((map) => map.scanner))) {
      counts[scanner] += 1;
    }
  }
  return counts;
}

export function hasActiveRulesFilters(query: RulesQuery): boolean {
  return query.section !== null || query.scanner !== null;
}

export function ruleSectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? `Section ${section}`;
}

/** Weight 0 / `scored: false` controls are visible but never move the score. */
export function ruleWeightLabel(rule: Pick<RuleView, 'scored' | 'weight'>): string {
  if (!rule.scored) return 'Not scored';
  return rule.weight === 1 ? 'Weight 1' : `Weight ${rule.weight}`;
}
