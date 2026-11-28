import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ReadinessAttestationList from '../app/components/readiness/ReadinessAttestationList.vue';
import ReadinessDataView from '../app/components/readiness/ReadinessDataView.vue';

describe('readiness pages', () => {
  it('renders an inventory table from bounded signals', async () => {
    const page = await mountSuspended(ReadinessDataView, {
      props: {
        title: 'Data Inventory',
        summary: 'Detected field names, routes, dependencies, and regions.',
        columns: ['Detector', 'Token', 'Path'],
        rows: [{ Detector: 'form_scan', Token: 'email_address', Path: 'src/api/user.ts' }],
      },
    });
    expect(page.find('h1').text()).toBe('Data Inventory');
    expect(page.text()).toContain('email_address');
    expect(page.find('table').exists()).toBe(true);
  });

  it('renders attestation state without treating it as code evidence', async () => {
    const page = await mountSuspended(ReadinessAttestationList, {
      props: {
        canWrite: true,
        rows: [
          {
            id: 'att-1',
            repositoryId: 'repo-1',
            key: 'secrets.managed_store',
            answer: true,
            note: null,
            attestedBy: 'user-1',
            attestedAt: '2026-11-27T00:00:00.000Z',
            expiresAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2026-11-27T00:00:00.000Z',
          },
        ],
      },
    });
    expect(page.text()).toContain('secrets.managed_store');
    expect(page.text()).toContain('Attested yes');
    expect(page.findAll('button').some((button) => button.text() === 'Record attestation')).toBe(
      true,
    );
    expect(page.text()).not.toContain('evidence reference');
  });
});
