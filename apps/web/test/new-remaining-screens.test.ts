import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewReport from '../app/components/new/NewReport.vue';
import NewRules from '../app/components/new/NewRules.vue';

describe('remaining rebuilt screens', () => {
  it('renders one h1 on report and rules screens', async () => {
    const report = await mountSuspended(NewReport, {
      props: { scanId: 'scan_1', canExport: true },
    });
    const rules = await mountSuspended(NewRules, { props: { rules: [] } });
    expect(report.findAll('h1')).toHaveLength(1);
    expect(rules.findAll('h1')).toHaveLength(1);
    expect(rules.text()).toContain('No rules found');
  });
});
