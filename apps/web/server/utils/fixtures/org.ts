import { FIXTURE_ORG_ID, FIXTURE_USER_ID } from '~~/shared/fixtures';
import type { OrgDetail, OrgMember } from '~~/shared/org';

/**
 * Read-only fixture organisation for dev/CI. The fixture session is an
 * `auditor`, so write endpoints answer `403` exactly as the real role gate
 * would; mutating fixtures would fake permissions the product does not grant.
 */
export function fixtureOrgDetail(): OrgDetail {
  return {
    id: FIXTURE_ORG_ID,
    name: 'Acme Payments',
    slug: 'acme-payments',
    plan: 'pro',
    dataRegion: 'ap-south-1',
    retentionDays: 365,
    scanConcurrency: 3,
    settings: { notifications: true },
    role: 'auditor',
  };
}

export function fixtureOrgMembers(): OrgMember[] {
  return [
    {
      userId: FIXTURE_USER_ID,
      name: 'Fixture auditor',
      email: 'auditor@example.test',
      role: 'auditor',
      status: 'active',
      lastLoginAt: '2026-11-13T09:30:00.000Z',
    },
    {
      userId: '0f000000-0000-4000-8000-000000000003',
      name: 'Priya Owner',
      email: 'owner@example.test',
      role: 'owner',
      status: 'active',
      lastLoginAt: '2026-11-12T16:05:00.000Z',
    },
  ];
}
