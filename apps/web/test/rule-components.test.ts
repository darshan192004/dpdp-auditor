import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import RuleCard from '../app/components/rules/RuleCard.vue';
import RuleMappingTable from '../app/components/rules/RuleMappingTable.vue';
import SectionNav from '../app/components/rules/SectionNav.vue';
import { getFixtureRule } from '../server/utils/fixtures/rules';

const ENCRYPTION = getFixtureRule('DPDPA-8.4-ENC-01');
const UNMAPPED = getFixtureRule('DPDPA-12-ACCESS-01');

describe('RuleCard', () => {
  it('summarises the control and links to its detail page', async () => {
    const wrapper = await mountSuspended(RuleCard, { props: { rule: ENCRYPTION } });

    expect(wrapper.text()).toContain('DPDPA-8.4-ENC-01');
    expect(wrapper.text()).toContain('Personal data is encrypted at rest');
    expect(wrapper.text()).toContain('3 scanner rules');
    expect(wrapper.text()).toContain('Weight 5');
    expect(wrapper.find('a').attributes('href')).toBe('/app/rules/DPDPA-8.4-ENC-01');
  });

  it('marks a control that does not move the score', async () => {
    const wrapper = await mountSuspended(RuleCard, { props: { rule: UNMAPPED } });

    expect(wrapper.text()).toContain('Not scored');
    expect(wrapper.text()).toContain('0 scanner rules');
    expect(wrapper.text()).toContain('Right to access');
  });
});

describe('SectionNav', () => {
  const sections = [
    { section: '6', label: 'Consent', count: 2 },
    { section: '8(4)', label: 'Security safeguards', count: 3 },
  ];

  it('marks the active section and counts every control', async () => {
    const wrapper = await mountSuspended(SectionNav, {
      props: { sections, active: '8(4)', scanner: null },
    });

    const links = wrapper.findAll('a');
    expect(links[0]?.text()).toContain('All controls');
    expect(links[0]?.text()).toContain('5');
    expect(links[0]?.attributes('aria-current')).toBeUndefined();

    const active = links.find((link) => link.text().includes('Security safeguards'));
    expect(active?.attributes('href')).toBe('/app/rules?section=8%284%29');
    expect(active?.attributes('aria-current')).toBe('page');
    expect(active?.text()).toContain('3');
  });

  it('keeps the scanner filter when switching section', async () => {
    const wrapper = await mountSuspended(SectionNav, {
      props: { sections, active: null, scanner: 'checkov' },
    });

    expect(wrapper.find('a').attributes('href')).toBe('/app/rules?scanner=checkov');
    expect(wrapper.find('a[href="/app/rules?section=6&scanner=checkov"]').exists()).toBe(true);
  });
});

describe('RuleMappingTable', () => {
  it('lists the scanner rule, evidence strength, and rationale', async () => {
    const wrapper = await mountSuspended(RuleMappingTable, {
      props: { mappings: ENCRYPTION.mappings },
    });

    expect(wrapper.findAll('tbody tr')).toHaveLength(3);
    expect(wrapper.text()).toContain('CKV_AWS_19');
    expect(wrapper.text()).toContain('Direct evidence');
    expect(wrapper.text()).toContain('server-side encryption');
    expect(wrapper.find('caption').text()).toContain('produce evidence');
  });

  it('explains a control with no scanner mapping', async () => {
    const wrapper = await mountSuspended(RuleMappingTable, { props: { mappings: [] } });

    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.text()).toContain('No scanner rule maps to this control');
  });
});
