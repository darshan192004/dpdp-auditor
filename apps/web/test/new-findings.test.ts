import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import type { FindingView } from '~~/shared/findings';

import NewFindings from '../app/components/new/NewFindings.vue';

const finding = {
  id: 'fnd_1',
  scanId: 'scn_1',
  scanner: 'semgrep',
  scannerRuleId: 'r1',
  severity: 'high',
  confidence: 'direct',
  status: 'open',
  isNew: true,
  filePath: 'Dockerfile',
  lineStart: 29,
  lineEnd: 29,
  message: 'Root container user',
  evidence: { hash: 'sha256:abc' },
  dpdpa: null,
  remediation: { summary: 'Fix it', steps: [] },
} as FindingView;

describe('NewFindings', () => {
  it('renders severity, location and evidence hash', async () => {
    const wrapper = await mountSuspended(NewFindings, {
      props: {
        findings: [finding],
        pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
        selected: finding,
        filters: {
          severity: [],
          scanner: [],
          section: [],
          status: [],
          file: '',
          q: '',
          page: 1,
          pageSize: 50,
          sort: '-severity',
        },
        sort: '-severity',
        role: 'auditor',
      },
    });
    expect(wrapper.text()).toContain('Root container user');
    expect(wrapper.text()).toContain('Dockerfile:29');
    expect(wrapper.text()).toContain('sha256:abc');
  });
});
