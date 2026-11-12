import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import FindingDetail from '../app/components/findings/FindingDetail.vue';
import { FIXTURE_FINDINGS } from '../server/utils/fixtures/findings';

const loggedFinding = FIXTURE_FINDINGS.find((finding) => finding.id.endsWith('101'))!;
const secretFinding = FIXTURE_FINDINGS.find((finding) => finding.id.endsWith('103'))!;

describe('FindingDetail (docs/design.md §5.4)', () => {
  it('leads with the finding message as the drawer heading', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    const heading = wrapper.find('h2');
    expect(heading.text()).toBe('Personal data is written to application logs.');
    expect(heading.attributes('id')).toBe('finding-title');
  });

  it('shows the control code, section and scanner in the summary', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    const text = wrapper.text();
    expect(text).toContain('DPDPA-8.4-LOG-01');
    expect(text).toContain('8(4)');
    expect(text).toContain('Semgrep');
    expect(text).toContain('services/payments/api/views.py:142–149');
  });

  it('explains why the finding matters using the DPDPA rationale', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    expect(wrapper.text()).toContain('Why this matters');
    expect(wrapper.text()).toContain('widens access beyond the purpose');
  });

  it('renders a redacted snippet for code findings', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    expect(wrapper.text()).toContain('card=****4242');
  });

  it('withholds secret values and shows only the hash prefix', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: secretFinding, role: 'auditor' },
    });

    const text = wrapper.text();
    expect(text).toContain('Value withheld for security');
    expect(text).toContain('sha256:');
    expect(text).not.toContain('AKIA');
  });

  it('lists numbered remediation steps', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    expect(wrapper.findAll('ol li')).toHaveLength(3);
    expect(wrapper.text()).toContain('Delete the PII fields from the log call.');
  });

  it('disables triage for a read-only role and explains why', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'viewer' },
    });

    expect(wrapper.text()).toContain('Your role can review findings but not change them.');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('emits a valid triage disposition', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    await wrapper.find('select[name="status"]').setValue('accepted_risk');
    await wrapper
      .find('textarea[name="note"]')
      .setValue('Risk accepted until the Q1 migration lands.');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('triage')?.[0]?.[0]).toMatchObject({
      status: 'accepted_risk',
      note: 'Risk accepted until the Q1 migration lands.',
    });
  });

  it('blocks submit and reports the note minimum inline', async () => {
    const wrapper = await mountSuspended(FindingDetail, {
      props: { finding: loggedFinding, role: 'auditor' },
    });

    await wrapper.find('select[name="status"]').setValue('false_positive');
    await wrapper.find('textarea[name="note"]').setValue('short');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('triage')).toBeUndefined();
    expect(wrapper.text()).toContain('at least 10 characters');
  });
});
