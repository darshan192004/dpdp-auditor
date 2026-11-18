import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import type { FindingView } from '~~/shared/findings';

import NewFindings from '../app/components/new/NewFindings.vue';

const finding = {
  id: 'fnd_1',
  severity: 'high',
  message: 'Root container user',
  filePath: 'Dockerfile',
  lineStart: 29,
  evidence: { hash: 'sha256:abc' },
} as unknown as FindingView;

describe('NewFindings', () => {
  it('renders severity, location and evidence hash', async () => {
    const wrapper = await mountSuspended(NewFindings, { props: { findings: [finding] } });
    expect(wrapper.text()).toContain('Root container user');
    expect(wrapper.text()).toContain('Dockerfile:29');
    expect(wrapper.text()).toContain('sha256:abc');
  });
});
