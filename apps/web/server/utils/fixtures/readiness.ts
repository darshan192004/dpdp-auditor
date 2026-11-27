import { FIXTURE_V2_SCAN_ID } from '~~/shared/fixtures';
import type { FixPlan, ReadinessGap, ReadinessInventory } from '~~/shared/readiness';
import { fixtureV2FixPlan, fixtureV2Gaps } from './v2-walkthrough';

export function fixtureInventory(): ReadinessInventory {
  return {
    version: 'inventory-1.0.0',
    status: 'completed',
    consentGatingRatio: 0.75,
    signals: [
      {
        detector: 'form_scan',
        kind: 'field',
        path: 'src/api/user.ts',
        line: 12,
        token: 'email_address',
        count: 1,
      },
    ],
  };
}

export function fixtureGaps(scanId?: string): ReadinessGap[] {
  if (scanId === FIXTURE_V2_SCAN_ID) return fixtureV2Gaps();
  return [
    {
      controlCode: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      title: 'Secrets are not stored in source',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      evidence: [{ kind: 'violation', scanner: 'gitleaks' }],
    },
  ];
}

export function fixtureFixPlan(scanId?: string): FixPlan {
  if (scanId === FIXTURE_V2_SCAN_ID) return fixtureV2FixPlan();
  return {
    steps: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        title: 'Secrets are not stored in source',
        remedy: 'Use a secret manager.',
      },
    ],
  };
}
