// apps/orchestrator/test/consent-gating.test.ts
import { describe, expect, it } from 'vitest';
import { computeConsentGatingRatio } from '../src/modules/scoring/consent-gating.js';

const fact = (key: string, signals: Array<Record<string, unknown>>) => ({
  key,
  signals,
  detectedAt: '2026-11-27T10:00:00.000Z',
});

describe('computeConsentGatingRatio', () => {
  it('counts unique personal-data paths and matches gates by path', () => {
    const ratio = computeConsentGatingRatio({
      facts: {
        inventory: [
          fact('form_scan', [
            {
              detector: 'form_scan',
              kind: 'route',
              path: 'src/signup.ts',
              line: 12,
              token: 'email',
            },
            {
              detector: 'form_scan',
              kind: 'field',
              path: 'src/signup.ts',
              line: 13,
              token: 'phone',
            },
            {
              detector: 'form_scan',
              kind: 'route',
              path: 'src/contact.ts',
              line: 8,
              token: 'email',
            },
          ]),
          fact('cmp_scan', [
            {
              detector: 'cmp_scan',
              kind: 'route',
              path: 'src/signup.ts',
              line: 4,
              token: 'consent_gate',
            },
          ]),
        ],
      },
      detectorStatuses: { form_scan: 'completed', cmp_scan: 'completed' },
    });
    expect(ratio).toBe(0.5);
  });

  it('returns null when a required detector did not complete', () => {
    const ratio = computeConsentGatingRatio({
      facts: {
        inventory: [
          fact('form_scan', [
            {
              detector: 'form_scan',
              kind: 'route',
              path: 'src/signup.ts',
              line: 12,
              token: 'email',
            },
          ]),
        ],
      },
      detectorStatuses: { form_scan: 'completed', cmp_scan: 'failed' },
    });
    expect(ratio).toBeNull();
  });

  it('returns null when no personal-data collection surface was detected', () => {
    const ratio = computeConsentGatingRatio({
      facts: { inventory: [] },
      detectorStatuses: { form_scan: 'completed', cmp_scan: 'completed' },
    });
    expect(ratio).toBeNull();
  });
});
