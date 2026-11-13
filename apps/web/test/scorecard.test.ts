import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import ScoreCard from '../app/components/scan/ScoreCard.vue';
import SectionBreakdown from '../app/components/scan/SectionBreakdown.vue';
import { scanSections } from '../shared/scan';

const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const COUNTS = { critical: 3, high: 3, medium: 4, low: 3, info: 1, total: 14 };

function card(overrides: Record<string, unknown> = {}) {
  return mountSuspended(ScoreCard, {
    props: {
      scanId: SCAN_ID,
      score: 82.6,
      grade: 'B',
      previousScore: 78.4,
      coverage: 'full',
      coverageNote: null,
      counts: COUNTS,
      ...overrides,
    },
  });
}

describe('ScoreCard (docs/design.md §5.1)', () => {
  it('shows the score, grade, and a labelled gauge', async () => {
    const wrapper = await card();

    expect(wrapper.text()).toContain('82.6');
    expect(wrapper.text()).toContain('Grade B');

    const gauge = wrapper.find('svg[role="img"]');
    expect(gauge.attributes('aria-label')).toBe('DPDPA score 82.6 out of 100, grade B');
  });

  it('compares with the previous scan and names the direction', async () => {
    const wrapper = await card();

    expect(wrapper.text()).toContain('4.2 vs last');
    expect(wrapper.text()).toContain('up 4.2 points versus the previous scan');
  });

  it('says "First scan" when there is no previous score', async () => {
    const wrapper = await card({ previousScore: null });

    expect(wrapper.text()).toContain('First scan');
    expect(wrapper.text()).not.toContain('vs last');
  });

  it('links each count to the filtered findings view', async () => {
    const wrapper = await card();
    const links = wrapper.findAll('a');

    expect(links).toHaveLength(5);
    expect(links[0]?.attributes('href')).toBe(`/app/scans/${SCAN_ID}/findings?severity=critical`);
    expect(links[4]?.attributes('href')).toBe(`/app/scans/${SCAN_ID}/findings?severity=info`);
  });

  it('never shows a missing score as zero', async () => {
    const wrapper = await card({
      score: null,
      grade: null,
      previousScore: null,
      coverageNote: 'The scan is still running.',
    });

    expect(wrapper.text()).toContain('Not scored');
    expect(wrapper.text()).toContain('The scan is still running.');
    expect(wrapper.text()).not.toContain('0.0');
    expect(wrapper.find('svg[role="img"]').exists()).toBe(false);
  });

  it('withholds the grade and explains partial coverage', async () => {
    const wrapper = await card({
      score: 74.1,
      grade: null,
      previousScore: null,
      coverage: 'partial',
      coverageNote: 'Coverage incomplete: Gitleaks timed out.',
    });

    expect(wrapper.text()).toContain('Grade withheld');
    expect(wrapper.text()).toContain('Coverage incomplete: Gitleaks timed out.');
    expect(wrapper.text()).toContain('Grade withheld until every scanner completes.');
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });

  it('keeps the card dimensions while loading', async () => {
    const wrapper = await card({ isLoading: true });

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Loading scan score');
    expect(wrapper.text()).not.toContain('82.6');
  });
});

describe('SectionBreakdown (docs/design.md §5.2)', () => {
  const rows = scanSections({
    '8(4)': 68.2,
    '6': 61.5,
    '5': 85,
    '16': 100,
    '12': null,
  });

  it('renders a captioned table sorted worst first', async () => {
    const wrapper = await mountSuspended(SectionBreakdown, {
      props: { scanId: SCAN_ID, rows },
    });

    expect(wrapper.find('caption').text()).toContain('sorted from lowest to highest');

    const sections = wrapper.findAll('tbody th, tbody td:first-child');
    expect(sections).toHaveLength(5);
    expect(sections[0]?.text()).toContain('Consent');
    expect(sections[4]?.text()).toContain('Right to access');
  });

  it('pairs every score bar with a numeric label and status text', async () => {
    const wrapper = await mountSuspended(SectionBreakdown, {
      props: { scanId: SCAN_ID, rows },
    });

    const row = wrapper.findAll('tbody tr')[0];
    expect(row?.text()).toContain('61.5');
    expect(row?.text()).toContain('Non-compliant');
    expect(row?.find('[aria-hidden="true"] span').attributes('style')).toContain('width: 61.5%');
  });

  it('marks an unassessed section as muted and explains it', async () => {
    const wrapper = await mountSuspended(SectionBreakdown, {
      props: { scanId: SCAN_ID, rows },
    });

    const last = wrapper.findAll('tbody tr')[4];
    expect(last?.text()).toContain('—');
    expect(last?.text()).toContain('Not assessed by code');
    expect(last?.classes().join(' ')).toContain('text-ink-500');
  });

  it('links a section to its filtered findings', async () => {
    const wrapper = await mountSuspended(SectionBreakdown, {
      props: { scanId: SCAN_ID, rows },
    });

    expect(wrapper.find('tbody a').attributes('href')).toBe(
      `/app/scans/${SCAN_ID}/findings?section=6`,
    );
  });
});
