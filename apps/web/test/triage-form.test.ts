import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import TriageForm from '../app/components/findings/TriageForm.vue';

async function mountForm(currentStatus: 'open' | 'fixed' = 'open') {
  return mountSuspended(TriageForm, {
    props: { currentStatus, canTriage: true },
  });
}

function optionLabels(wrapper: Awaited<ReturnType<typeof mountForm>>): string[] {
  return wrapper.findAll('select#triage-status option').map((option) => option.text());
}

describe('TriageForm disposition options', () => {
  it('gives every disposition a unique visible label', async () => {
    const wrapper = await mountForm();

    const labels = optionLabels(wrapper);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it('distinguishes leaving an open finding open from reopening a closed one', async () => {
    const wrapper = await mountForm();

    expect(optionLabels(wrapper)).toContain('Leave open');
    expect(optionLabels(wrapper)).toContain('Reopen');
  });

  it('labels the open disposition as an action when the finding is closed', async () => {
    const wrapper = await mountForm('fixed');

    expect(optionLabels(wrapper)).toContain('Mark open');
    expect(optionLabels(wrapper)).toContain('Reopen');
  });
});
