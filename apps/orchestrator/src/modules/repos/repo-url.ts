import { ApiError } from '../../common/api-error.js';

export interface ParsedRepoUrl {
  owner: string;
  name: string;
  fullName: string;
  canonicalUrl: string;
}

/** GitHub user/org: alphanumeric or hyphen, no leading/trailing hyphen, ≤ 39 chars. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
/** GitHub repository names allow dots, underscores, and hyphens. */
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * P2-09 / P6-02: only `https://github.com/<owner>/<repo>` is accepted. The
 * host is matched exactly (no suffix confusion), and credentials, ports,
 * queries, fragments, and extra path segments are rejected before any network
 * call — the endpoint never becomes an SSRF pivot.
 */
export function parseGithubRepoUrl(input: string): ParsedRepoUrl {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Enter a valid GitHub repository URL.');
  }

  if (url.protocol !== 'https:') {
    throw new ApiError('VALIDATION_ERROR', 'Only HTTPS GitHub URLs are supported.');
  }
  if (url.hostname.toLowerCase() !== 'github.com' || url.port !== '') {
    throw new ApiError('VALIDATION_ERROR', 'Only github.com repository URLs are supported.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'The repository URL must not contain credentials or query parameters.',
    );
  }

  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    throw new ApiError('VALIDATION_ERROR', 'The URL must point at a repository: /<owner>/<repo>.');
  }

  const [owner = '', rawName = ''] = segments;
  const name = rawName.endsWith('.git') ? rawName.slice(0, -4) : rawName;
  if (!OWNER.test(owner) || !REPO_NAME.test(name) || name === '.' || name === '..') {
    throw new ApiError('VALIDATION_ERROR', 'The repository owner or name is not valid.');
  }

  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    canonicalUrl: `https://github.com/${owner}/${name}`,
  };
}
