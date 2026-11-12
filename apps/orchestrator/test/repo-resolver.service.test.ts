import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultGithubFetch,
  parseSymrefHead,
  repoSizeCapBytes,
  RepoResolverService,
  type GithubFetch,
  type GithubRepoMetadata,
  type GitRunner,
} from '../src/modules/repos/repo-resolver.service.js';

const URL = 'https://github.com/acme/payments-service';
const MB = 1024 * 1024;

const METADATA = {
  githubRepoId: 123n,
  defaultBranch: 'main',
  sizeKb: 1024,
  visibility: 'public' as const,
  isArchived: false,
  language: 'TypeScript',
};

function make(metadata: GithubRepoMetadata = METADATA, stdout = 'ref: refs/heads/develop\tHEAD\n') {
  const git = vi.fn<GitRunner>().mockResolvedValue(stdout);
  const fetchRepo = vi.fn<GithubFetch>().mockResolvedValue(metadata);
  const service = new RepoResolverService(git, fetchRepo);
  return { service, git, fetchRepo };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('repoSizeCapBytes', () => {
  it('gives Growth and Enterprise 250 MB and lower plans 100 MB', () => {
    expect(repoSizeCapBytes('free')).toBe(100 * MB);
    expect(repoSizeCapBytes('starter')).toBe(100 * MB);
    expect(repoSizeCapBytes('growth')).toBe(250 * MB);
    expect(repoSizeCapBytes('enterprise')).toBe(250 * MB);
  });
});

describe('parseSymrefHead', () => {
  it('reads the symbolic HEAD ref', () => {
    expect(parseSymrefHead('ref: refs/heads/main\tHEAD\nabc\tHEAD')).toBe('main');
    expect(parseSymrefHead('abc\tHEAD')).toBeNull();
    expect(parseSymrefHead('')).toBeNull();
  });
});

describe('RepoResolverService.resolve', () => {
  it('resolves a public repository and prefers the live default branch', async () => {
    const { service, git, fetchRepo } = make();

    const result = await service.resolve(URL, 'free');

    expect(git).toHaveBeenCalledWith(URL);
    expect(fetchRepo).toHaveBeenCalledWith('acme/payments-service');
    expect(result).toMatchObject({
      fullName: 'acme/payments-service',
      defaultBranch: 'develop',
      sizeKb: 1024,
      sizeBytes: 1024 * 1024,
      visibility: 'public',
      isPublic: true,
      isArchived: false,
      language: 'TypeScript',
      githubRepoId: 123n,
    });
  });

  it('falls back to the metadata default branch when ls-remote has no symref', async () => {
    const { service } = make(METADATA, '');
    await expect(service.resolve(URL, 'free')).resolves.toMatchObject({ defaultBranch: 'main' });
  });

  it('rejects private, missing, and branchless repositories with the same REPO_NOT_FOUND', async () => {
    await expect(
      make({ ...METADATA, visibility: 'private' }).service.resolve(URL, 'free'),
    ).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });

    const missing = make();
    missing.fetchRepo.mockResolvedValue(null);
    await expect(missing.service.resolve(URL, 'free')).rejects.toMatchObject({
      code: 'REPO_NOT_FOUND',
    });

    await expect(
      make({ ...METADATA, defaultBranch: '' }, '').service.resolve(URL, 'free'),
    ).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });
  });

  it('maps a failed ls-remote to REPO_NOT_FOUND without leaking details', async () => {
    const { service, git } = make();
    git.mockRejectedValue(new Error('repository not found'));
    await expect(service.resolve(URL, 'free')).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });
  });

  it('enforces the plan size cap', async () => {
    const big = { ...METADATA, sizeKb: 150 * 1024 };
    await expect(make(big).service.resolve(URL, 'free')).rejects.toMatchObject({
      code: 'REPO_TOO_LARGE',
    });
    await expect(make(big).service.resolve(URL, 'growth')).resolves.toMatchObject({
      sizeBytes: 150 * MB,
    });
  });

  it('rejects an invalid URL before any network call', async () => {
    const { service, git, fetchRepo } = make();
    await expect(service.resolve('https://gitlab.com/acme/repo', 'free')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(git).not.toHaveBeenCalled();
    expect(fetchRepo).not.toHaveBeenCalled();
  });
});

describe('defaultGithubFetch', () => {
  function stubFetch(response: Partial<Response> | Error) {
    const fetchMock =
      response instanceof Error
        ? vi.fn().mockRejectedValue(response)
        : vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('folds 403, 404, and 451 into "not found"', async () => {
    for (const status of [403, 404, 451]) {
      stubFetch({ status, ok: false } as Response);
      await expect(defaultGithubFetch('acme/repo')).resolves.toBeNull();
    }
  });

  it('raises UPSTREAM_UNAVAILABLE for other failures and network errors', async () => {
    stubFetch({ status: 500, ok: false } as Response);
    await expect(defaultGithubFetch('acme/repo')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });

    stubFetch(new Error('dns'));
    await expect(defaultGithubFetch('acme/repo')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });

  it('normalises a public response', async () => {
    const fetchMock = stubFetch({
      status: 200,
      ok: true,
      json: async () => ({
        id: 7,
        full_name: 'acme/repo',
        default_branch: 'main',
        size: 2048,
        private: false,
        visibility: 'public',
        archived: true,
        language: 'Go',
      }),
    } as Response);

    await expect(defaultGithubFetch('acme/repo')).resolves.toEqual({
      githubRepoId: 7n,
      defaultBranch: 'main',
      sizeKb: 2048,
      visibility: 'public',
      isArchived: true,
      language: 'Go',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/repo',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'dpdp-auditor' }),
      }),
    );
  });

  it('normalises internal visibility and missing optional fields', async () => {
    stubFetch({
      status: 200,
      ok: true,
      json: async () => ({
        full_name: 'acme/repo',
        default_branch: 'main',
        visibility: 'internal',
      }),
    } as Response);

    await expect(defaultGithubFetch('acme/repo')).resolves.toEqual({
      githubRepoId: null,
      defaultBranch: 'main',
      sizeKb: 0,
      visibility: 'internal',
      isArchived: false,
      language: null,
    });
  });

  it('returns null for a malformed body', async () => {
    stubFetch({ status: 200, ok: true, json: async () => ({}) } as Response);
    await expect(defaultGithubFetch('acme/repo')).resolves.toBeNull();
  });
});
