import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import StartScanDrawer from '../app/components/dashboard/StartScanDrawer.vue';
import type { SavedRepoView } from '../shared/repo';

// Warm heavy component trees at module scope: the in-test dynamic imports then
// resolve from cache instead of spending Vitest's 5s test budget on first-time
// transforms (which can exceed it under parallel-gate CPU contention).
await import('../app/components/new/NewFindings.vue');
await import('../app/components/new/NewScanDetail.vue');

const REPOS: SavedRepoView[] = [
  {
    id: 'repo_1',
    fullName: 'acme/repo',
    defaultBranch: 'main',
    visibility: 'public',
    connectedAt: '2026-11-01T00:00:00Z',
  },
];

describe('start-scan flow', () => {
  it('hosts the restored ScanSubmitForm and forwards its payload', async () => {
    const wrapper = await mountSuspended(StartScanDrawer, {
      props: { open: true, repos: REPOS, quota: { used: 1, limit: 10 }, submitting: false },
    });
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.text()).toContain('Start a scan');
    await wrapper.find('input#scan-url').setValue('https://github.com/acme/repo');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      githubUrl: 'https://github.com/acme/repo',
      profile: 'standard',
    });
  });
});

it('scan detail shows score with coverage and a cancel action for running scans', async () => {
  const NewScanDetail = (await import('../app/components/new/NewScanDetail.vue')).default;
  const wrapper = await mountSuspended(NewScanDetail, {
    props: {
      // Cast the full contract shape so typecheck stays green; the component
      // only reads the fields shown here.
      scan: {
        id: 'scn_1',
        status: 'scanning',
        score: null,
        grade: null,
        coverage: { semgrep: 'running' },
        repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
        ref: 'main',
        commitSha: null,
        previousScore: null,
        sectionScores: {},
        counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        scannerVersions: {},
        rulePackVersion: null,
        scoringVersion: null,
        error: null,
        timestamps: {
          queuedAt: '2026-11-19T05:00:00Z',
          startedAt: null,
          completedAt: null,
          durationMs: null,
        },
        links: { findings: '', events: '', report: '' },
      } as import('../shared/scan').ScanDetail,
    },
  });
  expect(wrapper.text()).toContain('acme/repo');
  expect(wrapper.text()).toContain('partial coverage');
  await wrapper.get('button[data-action="request-cancel"]').trigger('click');
  expect(wrapper.emitted('cancel')).toBeUndefined();
  expect(wrapper.get('[role="alertdialog"]').isVisible()).toBe(true);
  await wrapper.find('button[data-action="cancel"]').trigger('click');
  expect(wrapper.emitted('cancel')?.[0]?.[0]).toBe('Cancelled from the console');
});

it('findings view forwards triage and selection', async () => {
  const NewFindings = (await import('../app/components/new/NewFindings.vue')).default;
  const finding = {
    id: 'f1',
    scanId: 'scn_1',
    scanner: 'semgrep',
    scannerRuleId: 'r1',
    severity: 'high',
    confidence: 'direct',
    status: 'open',
    isNew: true,
    filePath: 'src/a.ts',
    lineStart: 1,
    lineEnd: 2,
    message: 'Issue',
    evidence: { hash: 'sha256:abc' },
    dpdpa: null,
    remediation: { summary: 'Fix it', steps: [] },
  } as const;
  const filters = {
    severity: [],
    scanner: [],
    section: [],
    status: [],
    file: '',
    q: '',
    page: 1,
    pageSize: 50,
    sort: '-severity' as const,
  };
  const wrapper = await mountSuspended(NewFindings, {
    props: {
      findings: [finding],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      selected: finding,
      filters,
      sort: filters.sort,
      role: 'auditor',
    },
  });
  expect(wrapper.text()).toContain('Issue');
  expect(wrapper.text()).toContain('sha256:abc');
  expect(wrapper.text()).toContain('1 total');
});

it('rules, audit and remediation screens expose their data and controls', async () => {
  const rules = [
    {
      code: 'S6.3',
      section: '§6',
      title: 'Encryption',
      summary: 'Encrypt data',
      obligation: 'Protect personal data',
      legalReference: 'DPDP Act §6',
      severity: 'high',
      weight: 2,
      scored: true,
      evidenceStrength: 'direct',
      tags: [],
      mappings: [],
      remediation: 'Enable encryption at rest',
    },
  ] as import('../shared/rules').RuleView[];
  const events = [
    {
      id: 1,
      actor: { type: 'user', id: null, name: 'dev@test' },
      action: 'scan.created',
      resource: { type: 'scan', id: 's1' },
      ip: null,
      userAgent: null,
      metadata: {},
      createdAt: '2026-11-19T00:00:00Z',
    },
  ] as import('../shared/audit').AuditLogEntry[];
  const scans = [
    {
      id: 's1',
      repositoryId: 'r1',
      repositoryFullName: 'acme/repo',
      status: 'completed',
      score: 90,
      grade: 'A',
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      createdAt: '2026-11-19T00:00:00Z',
      completedAt: null,
    },
  ] as import('../shared/scan').ScanSummary[];

  const NewRules = (await import('../app/components/new/NewRules.vue')).default;
  const rulesView = await mountSuspended(NewRules, { props: { rules } });
  expect(rulesView.text()).toContain('Encryption');
  expect(rulesView.find('input[data-rule-search]').exists()).toBe(true);

  const NewAudit = (await import('../app/components/new/NewAudit.vue')).default;
  const auditView = await mountSuspended(NewAudit, { props: { events } });
  expect(auditView.text()).toContain('scan.created');
  expect(auditView.find('input[data-audit-action]').exists()).toBe(true);

  const NewRemediationIndex = (await import('../app/components/new/NewRemediationIndex.vue'))
    .default;
  const remediationView = await mountSuspended(NewRemediationIndex, { props: { scans } });
  expect(remediationView.find('a[href="/app/scans/s1/remediation"]').exists()).toBe(true);
});

it('tokens define motion animations and reduced-motion coverage', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  // Nuxt's Vitest environment does not guarantee a file: import.meta.url, so
  // resolve from the working directory (apps/web) with a repo-root fallback.
  const candidates = [
    resolve(process.cwd(), 'app/assets/css/main.css'),
    resolve(process.cwd(), 'apps/web/app/assets/css/main.css'),
  ];
  const cssPath = candidates.find((candidate) => existsSync(candidate));
  expect(cssPath).toBeDefined();
  const css = readFileSync(cssPath!, 'utf8');
  expect(css).toContain('@keyframes scan-spin');
  expect(css).toContain('@keyframes scan-pulse');
  expect(css).toContain('@keyframes skeleton-shimmer');
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toContain('.ds-skeleton');
});
