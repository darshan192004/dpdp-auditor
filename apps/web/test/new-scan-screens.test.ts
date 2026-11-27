import { mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NewScanDetail from '../app/components/new/NewScanDetail.vue';

/** Keep motion-v on its instant reduced-motion path in this DOM environment. */
beforeEach(() => {
  const mediaQueryList = {
    matches: true,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  };
  vi.stubGlobal('matchMedia', () => mediaQueryList);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const HEADLINE_TILE_IDS = [
  'metric-tile',
  'evidence-coverage-tile',
  'open-gaps-tile',
  'consent-gating-tile',
] as const;

/** MotionTextReveal separates words with real U+00A0 characters. */
function headingText(wrapper: Awaited<ReturnType<typeof mountSuspended>>): string {
  return (wrapper.find('#unknown-heading').element.textContent ?? '').replace(/\u00A0/g, ' ');
}

describe('NewScanDetail', () => {
  it('renders score, grade and coverage together', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_1',
          status: 'completed',
          score: 100,
          grade: 'A',
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
          ref: 'main',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: null,
          scoringVersion: null,
          assessment: null,
          error: null,
          timestamps: {
            queuedAt: '2026-11-19T05:00:00Z',
            startedAt: '2026-11-19T05:00:10Z',
            completedAt: '2026-11-19T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    expect(wrapper.text()).toContain('100.0');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.text()).toContain('full coverage');
    expect(wrapper.findAll('h1')).toHaveLength(1);
  });

  it('shows insufficient evidence with no letter for a v2 silent scan', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v2',
          status: 'completed',
          score: null,
          grade: null,
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/fx-silent-app', visibility: 'public' },
          ref: '',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: 'scoring-2.0.0',
          assessment: {
            score: null,
            evidenceCoverage: 0,
            openGaps: 0,
            verdictCounts: { UNKNOWN: 12 },
            unknownControls: [],
            detectorStatuses: { gitleaks: 'completed' },
            gradeWithheldReason: 'insufficient_evidence',
            consentGatingRatio: null,
          },
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    expect(wrapper.text()).toContain('Insufficient evidence');
    expect(wrapper.text()).toContain('No letter');
    expect(wrapper.text()).not.toContain('Compliant');
    expect(wrapper.text()).not.toContain('Non-compliant');

    const banner = wrapper.find('[data-testid="readiness-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toBe('Insufficient evidence — no letter');
    expect(wrapper.find('[data-testid="grade-tile"]').text()).toContain('No letter');
    expect(HEADLINE_TILE_IDS.every((id) => wrapper.find(`[data-testid="${id}"]`).exists())).toBe(
      true,
    );

    const consent = wrapper.find('[data-testid="consent-gating-tile"]');
    expect(consent.text()).toContain('Could not determine');
    expect(consent.text()).toContain('12 controls could not be determined');
    expect(consent.text()).not.toMatch(/\d+%/);

    const heading = wrapper.find('#unknown-heading');
    expect(headingText(wrapper)).toBe('Could not determine');
    const words = heading.findAll('span').map((span) => span.element.textContent ?? '');
    expect(words).toEqual(['Could\u00A0', 'not\u00A0', 'determine']);
  });

  it('adds four assessment tiles and a legacy badge for old scoring', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v1',
          status: 'completed',
          score: 90,
          grade: 'A',
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/legacy-repo', visibility: 'public' },
          ref: 'main',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: '1.0.0',
          assessment: null,
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });
    const text = wrapper.text();
    expect(text).toContain('Legacy scoring: no evidence was treated as pass');
    expect(text).toContain('Evidence coverage');
    expect(text).toContain('Open gaps');
    expect(text).toContain('Could not determine');

    const badge = wrapper.find('[data-testid="legacy-scoring-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('Legacy scoring: no evidence was treated as pass');
    expect(HEADLINE_TILE_IDS.every((id) => wrapper.find(`[data-testid="${id}"]`).exists())).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="evidence-coverage-tile"]').text()).toContain(
      'Legacy scoring: no evidence coverage',
    );
    expect(wrapper.find('[data-testid="open-gaps-tile"]').text()).toContain('0');
    expect(wrapper.find('[data-testid="consent-gating-tile"]').text()).toContain(
      'Could not determine',
    );
    expect(wrapper.find('[data-testid="readiness-banner"]').exists()).toBe(false);
    expect(headingText(wrapper)).toBe('Could not determine');

    const trigger = wrapper.find('[data-action="open-command-palette"]');
    expect(trigger.attributes('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes('class')).toContain('focus-visible:ring-2');
    await trigger.trigger('click');
    await flushPromises();
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    for (const label of ['Findings', 'Coverage', 'Remediation', 'Rules']) {
      expect(dialog.text()).toContain(label);
    }
    await dialog.find('input').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('names partial coverage, provisional score and raw detector statuses', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v2_partial',
          status: 'completed',
          score: 74.2,
          grade: 'A',
          coverage: { semgrep: 'completed', checkov: 'failed', gitleaks: 'timed_out' },
          repository: { id: 'r1', fullName: 'acme/partial-app', visibility: 'public' },
          ref: 'main',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 3 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: 'scoring-2.0.0',
          assessment: {
            score: 74.2,
            evidenceCoverage: 0.6,
            openGaps: 3,
            verdictCounts: { UNKNOWN: 2, FAIL: 3 },
            unknownControls: ['DPDPA-8.4-SECRET-01'],
            detectorStatuses: {
              semgrep: 'completed',
              checkov: 'failed',
              gitleaks: 'timed_out',
            },
            gradeWithheldReason: 'partial_coverage',
            consentGatingRatio: null,
          },
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });

    const banner = wrapper.find('[data-testid="readiness-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('Partial coverage — no letter');
    expect(banner.text().toLowerCase()).toContain('provisional');
    expect(banner.text().toLowerCase()).not.toContain('insufficient evidence');
    expect(wrapper.text().toLowerCase()).not.toContain('insufficient evidence');
    expect(wrapper.find('[data-testid="grade-tile"]').text()).toContain('No letter');
    expect(wrapper.find('[data-testid="score-ring"]').text()).not.toContain('grade A');

    const detectorBanner = wrapper
      .findAll('[role="status"]')
      .find((node) => node.text().includes('Detector status'));
    expect(detectorBanner).toBeDefined();
    expect(detectorBanner?.text()).toContain('checkov failed');
    expect(detectorBanner?.text()).toContain('gitleaks timed_out');
    expect(detectorBanner?.text()).not.toContain('skipped');

    expect(wrapper.find('[data-testid="evidence-coverage-tile"]').text()).toContain('60%');
    expect(wrapper.find('[data-testid="open-gaps-tile"]').text()).toContain('3');
    const consent = wrapper.find('[data-testid="consent-gating-tile"]');
    expect(consent.text()).toContain('Could not determine');
    expect(consent.text()).toContain('2 controls could not be determined');
    expect(consent.text()).not.toMatch(/\d+%/);
    expect(headingText(wrapper)).toBe('Could not determine');
    expect(wrapper.text()).toContain('DPDPA-8.4-SECRET-01');
  });

  it('keeps a fallback chip when unknown codes are missing and a detector note has a real line', async () => {
    const wrapper = await mountSuspended(NewScanDetail, {
      props: {
        scan: {
          id: 'scn_v2_no_codes',
          status: 'completed',
          score: null,
          grade: null,
          coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
          repository: { id: 'r1', fullName: 'acme/no-codes-app', visibility: 'public' },
          ref: 'main',
          commitSha: null,
          previousScore: null,
          sectionScores: {},
          counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          scannerVersions: {},
          rulePackVersion: 'dpdpa-2026.10.6',
          scoringVersion: 'scoring-2.0.0',
          assessment: {
            score: null,
            evidenceCoverage: 0,
            openGaps: 0,
            verdictCounts: { UNKNOWN: 12 },
            unknownControls: [],
            detectorStatuses: { checkov: 'failed', gitleaks: 'timed_out' },
            gradeWithheldReason: 'insufficient_evidence',
            consentGatingRatio: null,
          },
          error: null,
          timestamps: {
            queuedAt: '2026-11-27T05:00:00Z',
            startedAt: '2026-11-27T05:00:10Z',
            completedAt: '2026-11-27T05:01:00Z',
            durationMs: 50_000,
          },
          links: { findings: '', events: '', report: '' },
        } as import('../shared/scan').ScanDetail,
      },
    });

    const consent = wrapper.find('[data-testid="consent-gating-tile"]');
    expect(consent.text()).toContain('12 controls could not be determined');
    expect(headingText(wrapper)).toBe('Could not determine');

    const chips = wrapper.findAll('[data-testid="hover-card-trigger"]');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.text()).toContain('No control codes recorded');

    const detectorBanner = wrapper
      .findAll('[role="status"]')
      .find((node) => node.text().includes('Detector status'));
    expect(detectorBanner).toBeDefined();
    expect(detectorBanner?.text()).toContain('Detector status recorded for this scan.');
    expect(detectorBanner?.text()).toContain('checkov failed');
    expect(detectorBanner?.text()).toContain('gitleaks timed_out');
  });
});
