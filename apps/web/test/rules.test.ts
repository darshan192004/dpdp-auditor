import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FixtureNotFoundError } from '../server/utils/fixtures/findings';
import { getFixtureRule, listFixtureRules } from '../server/utils/fixtures/rules';
import { SECTION_LABELS } from '../shared/scan';
import {
  codeMatchesSection,
  filterRules,
  hasActiveRulesFilters,
  parseRulesQuery,
  ruleScannerCounts,
  ruleSections,
  rulesUrl,
  sortRules,
  type RuleView,
} from '../shared/rules';

// Vitest runs with cwd = apps/web, so resolve the catalog from there.
const CATALOG = JSON.parse(
  readFileSync(join(process.cwd(), '../../packages/rule-packs/scanner-catalog.json'), 'utf8'),
) as { scanners: Record<string, { rules: string[] }> };

const catalogRuleIds = new Set(Object.values(CATALOG.scanners).flatMap((entry) => entry.rules));

const allRules = (): RuleView[] => listFixtureRules({ section: null, scanner: null }).data;

describe('parseRulesQuery', () => {
  it('returns an unfiltered query for empty input', () => {
    expect(parseRulesQuery({})).toEqual({ section: null, scanner: null });
  });

  it('keeps a section and a known scanner', () => {
    expect(parseRulesQuery({ section: '8(4)', scanner: 'checkov' })).toEqual({
      section: '8(4)',
      scanner: 'checkov',
    });
  });

  it('ignores an unknown scanner instead of rejecting the link', () => {
    expect(parseRulesQuery({ scanner: 'trivy' }).scanner).toBeNull();
  });

  it('trims and bounds the section value', () => {
    expect(parseRulesQuery({ section: '  6  ' }).section).toBe('6');
    expect(parseRulesQuery({ section: 'x'.repeat(40) }).section).toHaveLength(16);
  });

  it('ignores non-string values', () => {
    expect(parseRulesQuery({ section: ['6'], scanner: 3 })).toEqual({
      section: null,
      scanner: null,
    });
  });
});

describe('rulesUrl', () => {
  it('omits empty filters', () => {
    expect(rulesUrl({ section: null, scanner: null })).toBe('/app/rules');
  });

  it('round-trips through parseRulesQuery', () => {
    const query = { section: '8(4)', scanner: 'gitleaks' as const };
    const url = rulesUrl(query);
    const search = url.slice(url.indexOf('?') + 1);

    expect(parseRulesQuery(Object.fromEntries(new URLSearchParams(search)))).toEqual(query);
  });

  it('reports whether any filter is active', () => {
    expect(hasActiveRulesFilters({ section: null, scanner: null })).toBe(false);
    expect(hasActiveRulesFilters({ section: '6', scanner: null })).toBe(true);
    expect(hasActiveRulesFilters({ section: null, scanner: 'semgrep' })).toBe(true);
  });
});

describe('codeMatchesSection', () => {
  it('matches the numeric section prefix', () => {
    expect(codeMatchesSection('DPDPA-8.4-ENC-01', '8(4)')).toBe(true);
    expect(codeMatchesSection('DPDPA-8.4-ENC-01', '8(5)')).toBe(false);
    expect(codeMatchesSection('DPDPA-6-CONSENT-01', '6')).toBe(true);
  });
});

describe('sortRules', () => {
  it('orders by legal section then control code', () => {
    const shuffled = [...allRules()].reverse();
    const sorted = sortRules(shuffled);
    const rank = Object.keys(SECTION_LABELS);

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      const bySection = rank.indexOf(previous.section) - rank.indexOf(current.section);
      expect(bySection < 0 || (bySection === 0 && previous.code <= current.code)).toBe(true);
    }
  });
});

describe('filterRules', () => {
  it('filters by section', () => {
    const rules = filterRules(allRules(), { section: '8(4)', scanner: null });

    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((rule) => rule.section === '8(4)')).toBe(true);
  });

  it('filters by scanner mapping, not by evidence strength', () => {
    const rules = filterRules(allRules(), { section: null, scanner: 'gitleaks' });

    expect(rules.length).toBeGreaterThan(0);
    expect(
      rules.every((rule) => rule.mappings.some((mapping) => mapping.scanner === 'gitleaks')),
    ).toBe(true);
  });

  it('combines both filters', () => {
    const rules = filterRules(allRules(), { section: '6', scanner: 'semgrep' });

    expect(rules.every((rule) => rule.section === '6')).toBe(true);
    expect(rules.every((rule) => rule.mappings.some((map) => map.scanner === 'semgrep'))).toBe(
      true,
    );
  });
});

describe('ruleSections', () => {
  it('lists present sections in legal order with control counts', () => {
    const sections = ruleSections(allRules());
    const rank = Object.keys(SECTION_LABELS);
    const positions = sections.map((option) => rank.indexOf(option.section));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(sections.reduce((sum, option) => sum + option.count, 0)).toBe(allRules().length);
    expect(sections.find((option) => option.section === '8(4)')?.label).toBe('Security safeguards');
  });

  it('appends unknown sections after the known ones', () => {
    const unknown = { ...allRules()[0]!, section: '99', code: 'DPDPA-99-X-01' };
    const sections = ruleSections([...allRules(), unknown]);

    expect(sections.at(-1)).toEqual({ section: '99', label: 'Section 99', count: 1 });
  });
});

describe('ruleScannerCounts', () => {
  it('counts a rule once per scanner even with several mappings', () => {
    const rules = allRules();
    const counts = ruleScannerCounts(rules);

    for (const scanner of ['semgrep', 'checkov', 'gitleaks'] as const) {
      expect(counts[scanner]).toBe(
        rules.filter((rule) => rule.mappings.some((mapping) => mapping.scanner === scanner)).length,
      );
    }
  });
});

describe('fixture rule catalog (docs/api.md §7.1)', () => {
  it('pins every mapping rule ID to the scanner catalog', () => {
    for (const rule of allRules()) {
      for (const mapping of rule.mappings) {
        expect(catalogRuleIds.has(mapping.ruleId)).toBe(true);
      }
    }
  });

  it('keeps every control code inside its declared section', () => {
    for (const rule of allRules()) {
      expect(codeMatchesSection(rule.code, rule.section)).toBe(true);
    }
  });

  it('covers scored and not-scored controls, including one without mappings', () => {
    const rules = allRules();
    const unscored = rules.find((rule) => !rule.scored);

    expect(unscored?.code).toBe('DPDPA-12-ACCESS-01');
    expect(unscored?.mappings).toEqual([]);
    expect(rules.some((rule) => rule.scored)).toBe(true);
  });

  it('filters and sorts through the fixture page', () => {
    const page = listFixtureRules({ section: '8(4)', scanner: 'checkov' });

    expect(page.pagination.totalItems).toBe(page.data.length);
    expect(page.data.every((rule) => rule.section === '8(4)')).toBe(true);
    expect(
      page.data.every((rule) => rule.mappings.some((mapping) => mapping.scanner === 'checkov')),
    ).toBe(true);
  });

  it('returns a clone so a caller cannot mutate the fixture catalog', () => {
    const rule = getFixtureRule('DPDPA-8.4-ENC-01');
    rule.title = 'changed';

    expect(getFixtureRule('DPDPA-8.4-ENC-01').title).not.toBe('changed');
  });

  it('rejects an unknown control', () => {
    expect(() => getFixtureRule('DPDPA-00-NOPE-01')).toThrow(FixtureNotFoundError);
  });
});
