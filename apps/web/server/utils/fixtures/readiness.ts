import type { FixPlan, ReadinessGap, ReadinessInventory } from '~~/shared/readiness';

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

export function fixtureGaps(): ReadinessGap[] {
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

export function fixtureFixPlan(): FixPlan {
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
