import { describe, expect, it } from 'vitest';

import { breadcrumbsFor } from '../app/utils/breadcrumbs';

describe('breadcrumbsFor', () => {
  it('maps a findings route to labelled crumbs', () => {
    expect(breadcrumbsFor('/app/scans/scan-1/findings')).toEqual([
      { label: 'Overview', to: '/app' },
      { label: 'Scans', to: '/app/scans' },
      { label: 'scan-1', to: '/app/scans/scan-1' },
      { label: 'Findings' },
    ]);
  });

  it('maps remediation and coverage routes', () => {
    expect(breadcrumbsFor('/app/scans/scan-1/remediation').at(-1)).toEqual({
      label: 'Remediation',
    });
    expect(breadcrumbsFor('/app/scans/scan-1/coverage').at(-1)).toEqual({ label: 'Coverage' });
    expect(breadcrumbsFor('/app/remediation').at(-1)).toEqual({ label: 'Remediation' });
  });
});
