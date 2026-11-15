import { describe, expect, it } from 'vitest';
import { parseGithubRepoUrl } from '../src/modules/repos/repo-url.js';

// P2-09: SSRF guard and GitHub-only URL validation.
describe('GitHub URL allowlist (P2-09)', () => {
  it('accepts https://github.com/owner/repo exactly', () => {
    const result = parseGithubRepoUrl('https://github.com/acme/payments-service');
    expect(result).toEqual({
      owner: 'acme',
      name: 'payments-service',
      fullName: 'acme/payments-service',
      canonicalUrl: 'https://github.com/acme/payments-service',
    });
  });

  it('accepts the same URL with a trailing .git', () => {
    const result = parseGithubRepoUrl('https://github.com/acme/repo.git');
    expect(result).toEqual({
      owner: 'acme',
      name: 'repo',
      fullName: 'acme/repo',
      canonicalUrl: 'https://github.com/acme/repo',
    });
  });

  it('rejects http URLs', () => {
    expect(() => parseGithubRepoUrl('http://github.com/acme/repo')).toThrow(
      'Only HTTPS GitHub URLs are supported.',
    );
  });

  it('rejects github.com with extra path segments', () => {
    expect(() => parseGithubRepoUrl('https://github.com/acme/repo/extra')).toThrow(
      'The URL must point at a repository: /<owner>/<repo>.',
    );
  });

  it('rejects github.com with query parameters', () => {
    expect(() => parseGithubRepoUrl('https://github.com/acme/repo?ref=main')).toThrow(
      'The repository URL must not contain credentials or query parameters.',
    );
  });

  it('rejects github.com with port', () => {
    expect(() => parseGithubRepoUrl('https://github.com:8080/acme/repo')).toThrow(
      'Only github.com repository URLs are supported.',
    );
  });

  it('rejects github.com with credentials in URL', () => {
    expect(() =>
      parseGithubRepoUrl('https://user:pass@github.com/acme/repo'),
    ).toThrow('The repository URL must not contain credentials or query parameters.');
  });

  it('rejects invalid owner or repository name', () => {
    expect(() => parseGithubRepoUrl('https://github.com/-acme/repo')).toThrow(
      'The repository owner or name is not valid.',
    );
    expect(() => parseGithubRepoUrl('https://github.com/acme-/repo')).toThrow(
      'The repository owner or name is not valid.',
    );
  });

  it('rejects excessively long owner or repository names', () => {
    const longOwner = 'a'.repeat(40);
    expect(() => parseGithubRepoUrl(`https://github.com/${longOwner}/repo`)).toThrow(
      'The repository owner or name is not valid.',
    );
    const longRepo = 'a'.repeat(101);
    expect(() => parseGithubRepoUrl(`https://github.com/acme/${longRepo}`)).toThrow(
      'The repository owner or name is not valid.',
    );
  });
});
