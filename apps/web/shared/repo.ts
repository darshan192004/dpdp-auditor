/** P2-C: shared repo contracts between Nitro and the browser. */

import { GITHUB_URL_PATTERN } from './scan';

export type RepoVisibility = 'public' | 'private' | 'internal';

export interface ResolveRepoInput {
  githubUrl: string;
}

/** POST /api/v1/repos/resolve response. */
export interface ResolvedRepoView {
  fullName: string;
  defaultBranch: string;
  sizeBytes: number;
  visibility: RepoVisibility;
  isPublic: boolean;
}

export interface SaveRepoInput {
  githubUrl: string;
}

/** POST /api/v1/repos response and list item. */
export interface SavedRepoView {
  id: string;
  fullName: string;
  defaultBranch: string;
  visibility: RepoVisibility;
  connectedAt: string;
}

/** GET /api/v1/repos response. */
export interface RepoListView {
  items: SavedRepoView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** GET /api/v1/repos/:repoId response. */
export interface RepoDetailView {
  id: string;
  fullName: string;
  defaultBranch: string;
  visibility: RepoVisibility;
  language: string | null;
  sizeKb: number | null;
  isArchived: boolean;
  connectedAt: string;
  lastScannedAt: string | null;
  stats: {
    totalScans: number;
    averageScore: number | null;
    lastScore: number | null;
    trend: 'up' | 'down' | 'flat' | null;
  };
}

/** Client-side validation errors. */
export class RepoInputError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'RepoInputError';
  }
}

function parseGithubUrl(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new RepoInputError('githubUrl', 'The request body must be a JSON object.');
  }
  const value = (raw as Record<string, unknown>).githubUrl;
  if (typeof value !== 'string') {
    throw new RepoInputError('githubUrl', 'Enter a GitHub repository URL.');
  }
  const url = value.trim();
  if (url.length === 0 || url.length > 2048 || !GITHUB_URL_PATTERN.test(url)) {
    throw new RepoInputError('githubUrl', 'Enter a valid GitHub repository URL.');
  }
  return url;
}

/** Validate resolve input and throw RepoInputError on failure. */
export function validateResolveInput(raw: unknown): ResolveRepoInput {
  return { githubUrl: parseGithubUrl(raw) };
}

/** Validate save input and throw RepoInputError on failure. */
export function validateSaveInput(raw: unknown): SaveRepoInput {
  return { githubUrl: parseGithubUrl(raw) };
}
