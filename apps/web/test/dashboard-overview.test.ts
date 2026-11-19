import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import DashboardPageHeader from '../app/components/dashboard/DashboardPageHeader.vue';
import FixFirstList from '../app/components/dashboard/FixFirstList.vue';
import SectionCoverageGrid from '../app/components/dashboard/SectionCoverageGrid.vue';
import TrendSparkline from '../app/components/dashboard/TrendSparkline.vue';
import type { FindingView } from '../shared/findings';

const FINDING = (id: string, severity: 'critical' | 'high' | 'medium') =>
  ({
    id,
    scanId: 'scn_1',
    scanner: 'gitleaks',
    scannerRuleId: 'rule-1',
    severity,
    confidence: 'direct',
    status: 'open',
    isNew: true,
    filePath: 'src/config.ts',
    lineStart: 10,
    lineEnd: 10,
    message: `Secret ${id}`,
    evidence: { hash: 'sha256:abc' },
    dpdpa: { code: 'S6.3', section: '§6', title: 'Security', severity, rationale: null },
    remediation: { summary: 'Rotate the key', steps: ['Rotate'] },
  }) as FindingView;

describe('overview building blocks', () => {
  it('renders section readiness states', async () => {
    const wrapper = await mountSuspended(SectionCoverageGrid, {
      props: {
        sections: [
          { code: '§3', title: 'Notice', state: 'ready', controls: 3 },
          { code: '§8', title: 'Retention', state: 'at_risk', controls: 2 },
        ],
      },
    });
    expect(wrapper.text()).toContain('READY');
    expect(wrapper.text()).toContain('AT RISK');
  });

  it('ranks the highest severity findings first and caps the list', async () => {
    const wrapper = await mountSuspended(FixFirstList, {
      props: {
        findings: [FINDING('low', 'medium'), FINDING('high', 'high'), FINDING('crit', 'critical')],
        limit: 2,
      },
    });
    expect(wrapper.text()).toContain('Secret crit');
    expect(wrapper.text()).toContain('Secret high');
    expect(wrapper.text()).not.toContain('Secret low');
    await wrapper.findAll('button')[0]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ id: 'crit' });
  });

  it('header exposes actions slot and subtitle', async () => {
    const wrapper = await mountSuspended(DashboardPageHeader, {
      props: { title: 'Overview', subtitle: 'DPDP posture' },
      slots: { actions: '<button>New scan</button>' },
    });
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('DPDP posture');
    expect(wrapper.text()).toContain('New scan');
  });

  it('sparkline renders nothing without enough history', async () => {
    const empty = await mountSuspended(TrendSparkline, { props: { values: [42] } });
    expect(empty.find('svg').exists()).toBe(false);
    const full = await mountSuspended(TrendSparkline, { props: { values: [40, 50, 60] } });
    expect(full.find('svg').exists()).toBe(true);
  });
});
