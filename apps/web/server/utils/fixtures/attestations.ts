import { FIXTURE_V2_REPO_ID } from '~~/shared/fixtures';
import { fixtureV2Attestations } from './v2-walkthrough';

export interface FixtureAttestation {
  id: string;
  repositoryId: string;
  key: string;
  answer: boolean;
  note: string | null;
  attestedBy: string;
  attestedAt: string;
  expiresAt: string | null;
  updatedAt: string;
}

export function fixtureAttestations(
  repositoryId = '0f000000-0000-4000-8000-000000000020',
): FixtureAttestation[] {
  if (repositoryId === FIXTURE_V2_REPO_ID) return fixtureV2Attestations();
  return [
    {
      id: 'att_01J8Z6C3D4E5F6G7H8J9K0M1N2',
      repositoryId,
      key: 'secrets.managed_store',
      answer: true,
      note: 'A managed credential store is used for this repository.',
      attestedBy: '0f000000-0000-4000-8000-000000000002',
      attestedAt: '2026-11-27T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    },
  ];
}
