import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import ReadinessAttestationList from '../app/components/readiness/ReadinessAttestationList.vue';
import { fixtureAttestations } from '../server/utils/fixtures/attestations';
import { getFixtureScan } from '../server/utils/fixtures/scans';

const V2_SCAN_ID = '0f000000-0000-4000-8000-0000000000a1';
const V2_REPO_ID = '0f000000-0000-4000-8000-0000000000a2';

describe('synthetic v2 walkthrough UI', () => {
  it('renders every readiness tile and withholds the letter grade', async () => {
    const page = await mountSuspended(NewScanDetail, {
      props: { scan: getFixtureScan(V2_SCAN_ID) },
    });
    const tile = (id: string) => page.find(`[data-testid="${id}"]`);

    expect(page.text()).toContain('Readiness score');
    expect(tile('evidence-coverage-tile').text()).toContain('Evidence coverage');
    expect(tile('evidence-coverage-tile').text()).toContain('Weight of determinable controls');
    expect(tile('open-gaps-tile').text()).toContain('Open gaps');
    expect(tile('open-gaps-tile').text()).toContain('Cited evidence of a gap');
    expect(tile('consent-gating-tile').text()).toContain('Consent gating');
    expect(tile('attested-statements-tile').text()).toContain('Attested statements');
    expect(tile('attested-statements-tile').text()).toContain(
      'Human statements; not code evidence',
    );
    expect(tile('detectors-unavailable-tile').text()).toContain('gitleaks');
    expect(page.find('[data-testid="grade-tile"]').text()).toContain('No letter');
    expect(page.find('[data-testid="readiness-banner"]').text()).toContain(
      'Insufficient evidence — no letter',
    );
  });

  it('shows the owner/admin write control and expiry state from fixtures', async () => {
    const page = await mountSuspended(ReadinessAttestationList, {
      props: { rows: fixtureAttestations(V2_REPO_ID), canWrite: true },
    });
    expect(page.findAll('button').some((button) => button.text() === 'Record attestation')).toBe(
      true,
    );
    expect(page.text()).toContain('Expired');
    expect(page.text()).toContain('Expires');
    expect(page.text()).not.toContain('evidence reference');
  });

  it('hides the write control for a read-only auditor', async () => {
    const page = await mountSuspended(ReadinessAttestationList, {
      props: { rows: fixtureAttestations(V2_REPO_ID), canWrite: false },
    });
    expect(page.findAll('button').some((button) => button.text() === 'Record attestation')).toBe(
      false,
    );
  });
});
