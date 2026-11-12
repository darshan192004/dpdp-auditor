import { Inject, Injectable } from '@nestjs/common';
import type { OrgPlan } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ApiError } from '../../common/api-error.js';
import type { RepoVisibilityValue } from './repo.schemas.js';
import { parseGithubRepoUrl } from './repo-url.js';

const execFileAsync = promisify(execFile);

export const GIT_RUNNER = Symbol('GIT_RUNNER');
export const GITHUB_FETCH = Symbol('GITHUB_FETCH');

const MB = 1024 * 1024;

export interface GithubRepoMetadata {
  githubRepoId: bigint | null;
  defaultBranch: string;
  sizeKb: number;
  visibility: RepoVisibilityValue;
  isArchived: boolean;
  language: string | null;
}

export interface ResolvedRepo {
  owner: string;
  name: string;
  fullName: string;
  canonicalUrl: string;
  githubRepoId: bigint | null;
  defaultBranch: string;
  sizeKb: number;
  sizeBytes: number;
  visibility: RepoVisibilityValue;
  isPublic: boolean;
  isArchived: boolean;
  language: string | null;
}

export type GitRunner = (url: string) => Promise<string>;
export type GithubFetch = (fullName: string) => Promise<GithubRepoMetadata | null>;

/**
 * architecture.md §12: repositories above the plan cap are refused before a
 * scan is enqueued. Growth/Enterprise get 250 MB; lower plans get 100 MB.
 */
export function repoSizeCapBytes(plan: OrgPlan): number {
  return plan === 'growth' || plan === 'enterprise' ? 250 * MB : 100 * MB;
}

/** `git ls-remote --symref <url> HEAD` prints `ref: refs/heads/<branch>\tHEAD`. */
export function parseSymrefHead(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const match = /^ref: refs\/heads\/(\S+)\tHEAD$/.exec(line.trim());
    if (match) return match[1] ?? null;
  }
  return null;
}

/** Anonymous `git ls-remote`; no credential and no shell interpolation. */
export async function defaultGitRunner(url: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['ls-remote', '--symref', url, 'HEAD'], {
    timeout: 15_000,
    maxBuffer: MB,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

interface GithubApiRepo {
  id?: number;
  full_name?: string;
  default_branch?: string;
  size?: number;
  private?: boolean;
  visibility?: string;
  archived?: boolean;
  language?: string | null;
}

/** Unauthenticated metadata lookup (api.md §5.2); no token is ever sent. */
export async function defaultGithubFetch(fullName: string): Promise<GithubRepoMetadata | null> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'dpdp-auditor',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'GitHub is unavailable. Try again.');
  }

  // 403 (rate limit/blocked) and 451 are folded into "not found" so the
  // endpoint never reveals whether a private repository exists.
  if (response.status === 404 || response.status === 403 || response.status === 451) return null;
  if (!response.ok) {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'GitHub is unavailable. Try again.');
  }

  const body = (await response.json()) as GithubApiRepo;
  if (typeof body.full_name !== 'string' || typeof body.default_branch !== 'string') return null;
  return {
    githubRepoId: typeof body.id === 'number' ? BigInt(body.id) : null,
    defaultBranch: body.default_branch,
    sizeKb: typeof body.size === 'number' ? body.size : 0,
    visibility: normalizeVisibility(body),
    isArchived: body.archived === true,
    language: typeof body.language === 'string' ? body.language : null,
  };
}

function normalizeVisibility(body: GithubApiRepo): RepoVisibilityValue {
  if (body.private === true) return 'private';
  return body.visibility === 'internal' ? 'internal' : 'public';
}

/**
 * P2-09: validate the URL, look the repository up anonymously, enforce the
 * plan size cap, and read the default branch with `git ls-remote`.
 */
@Injectable()
export class RepoResolverService {
  constructor(
    @Inject(GIT_RUNNER) private readonly git: GitRunner,
    @Inject(GITHUB_FETCH) private readonly fetchRepo: GithubFetch,
  ) {}

  async resolve(githubUrl: string, plan: OrgPlan): Promise<ResolvedRepo> {
    const parsed = parseGithubRepoUrl(githubUrl);
    const metadata = await this.fetchRepo(parsed.fullName);
    if (!metadata || metadata.visibility === 'private') {
      throw new ApiError('REPO_NOT_FOUND', 'Repository not found or not public.');
    }

    const sizeBytes = metadata.sizeKb * 1024;
    if (sizeBytes > repoSizeCapBytes(plan)) {
      throw new ApiError(
        'REPO_TOO_LARGE',
        `Repository is ${Math.ceil(sizeBytes / MB)} MB; the plan cap is ${Math.ceil(repoSizeCapBytes(plan) / MB)} MB.`,
      );
    }

    let stdout: string;
    try {
      stdout = await this.git(parsed.canonicalUrl);
    } catch {
      throw new ApiError('REPO_NOT_FOUND', 'Repository not found or not public.');
    }
    const defaultBranch = parseSymrefHead(stdout) ?? metadata.defaultBranch;
    if (!defaultBranch) throw new ApiError('REPO_NOT_FOUND', 'Repository not found or not public.');

    return {
      ...parsed,
      githubRepoId: metadata.githubRepoId,
      defaultBranch,
      sizeKb: metadata.sizeKb,
      sizeBytes,
      visibility: metadata.visibility,
      isPublic: metadata.visibility === 'public',
      isArchived: metadata.isArchived,
      language: metadata.language,
    };
  }
}
