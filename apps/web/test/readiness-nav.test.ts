import { describe, expect, it } from 'vitest';
import { APP_NAV, READINESS_NAV } from '../app/utils/nav';
import { breadcrumbsFor } from '../app/utils/breadcrumbs';

describe('readiness navigation', () => {
  it('keeps the existing six top-level destinations and adds readiness sublinks', () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      'Overview',
      'Repositories',
      'Scans',
      'Rules',
      'Audit',
      'Settings',
    ]);
    expect(READINESS_NAV.map((item) => item.to)).toEqual([
      '/app/readiness/inventory',
      '/app/readiness/gaps',
      '/app/readiness/fix-plan',
      '/app/readiness/attestations',
      '/app/readiness/exports',
    ]);
  });

  it('names every readiness page in the breadcrumb', () => {
    for (const [path, label] of [
      ['/app/readiness/inventory', 'Data Inventory'],
      ['/app/readiness/gaps', 'Compliance Gaps'],
      ['/app/readiness/fix-plan', 'Fix Plan'],
      ['/app/readiness/attestations', 'Attestations'],
      ['/app/readiness/exports', 'Exports'],
    ] as const) {
      expect(breadcrumbsFor(path).at(-1)).toEqual({ label });
    }
  });
});
