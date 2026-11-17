import type { RepoDetailView, RepoListView, ResolvedRepoView, SavedRepoView } from '~~/shared/repo';

/** P2-C: fixture repositories for dev/CI. */

export function fixtureResolvedRepo(): ResolvedRepoView {
  return {
    fullName: 'acme/payments-service',
    defaultBranch: 'main',
    sizeBytes: 86231040,
    visibility: 'public',
    isPublic: true,
  };
}

export function fixtureSavedRepos(): SavedRepoView[] {
  return [
    {
      id: 'repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      fullName: 'acme/payments-service',
      defaultBranch: 'main',
      visibility: 'public',
      connectedAt: '2026-11-10T14:30:00.000Z',
    },
    {
      id: 'repo_01J8Z3K4M5N6P7Q8R9S0T1U2V4',
      fullName: 'acme/user-api',
      defaultBranch: 'develop',
      visibility: 'public',
      connectedAt: '2026-11-12T09:15:00.000Z',
    },
  ];
}

export function fixtureRepoList(): RepoListView {
  return {
    items: fixtureSavedRepos(),
    pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
  };
}

export function fixtureRepoDetail(): RepoDetailView {
  return {
    id: 'repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
    fullName: 'acme/payments-service',
    defaultBranch: 'main',
    visibility: 'public',
    language: 'TypeScript',
    sizeKb: 84210,
    isArchived: false,
    connectedAt: '2026-11-10T14:30:00.000Z',
    lastScannedAt: '2026-11-13T16:45:00.000Z',
    stats: {
      totalScans: 8,
      averageScore: 76.5,
      lastScore: 78.2,
      trend: 'up',
    },
  };
}
