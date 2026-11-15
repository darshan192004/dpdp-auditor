import { describe, expect, it } from 'vitest';
import { parseGithubRepoUrl } from '../src/modules/repos/repo-url.js';

// P2-09: URL validation and allowlist edge cases.
describe('Repo URL validation (P2-09)', () => {
  it('accepts valid GitHub URLs', () => {
    const result = parseGithubRepoUrl('https://github.com/acme/payments-service');
    expect(result).toEqual({
      owner: 'acme',
      name: 'payments-service',
      fullName: 'acme/payments-service',
      canonicalUrl: 'https://github.com/acme/payments-service',
    });
  });

  it('accepts URLs with trailing .git', () => {
    const result = parseGithubRepoUrl('https://github.com/acme/repo.git');
    expect(result).toEqual({
      owner: 'acme',
      name: 'repo',
      fullName: 'acme/repo',
      canonicalUrl: 'https://github.com/acme/repo',
    });
  });

  it('rejects non-HTTPS URLs', () => {
    expect(() => parseGithubRepoUrl('http://github.com/acme/repo')).toThrow();
  });

  it('rejects non-github.com hosts', () => {
    expect(() => parseGithubRepoUrl('https://gitlab.com/acme/repo')).toThrow();
  });

  it('rejects URLs with credentials', () => {
    expect(() => parseGithubRepoUrl('https://user:pass@github.com/acme/repo')).toThrow();
  });

  it('rejects URLs with query strings', () => {
    expect(() => parseGithubRepoUrl('https://github.com/acme/repo?ref=main')).toThrow();
  });

  it('rejects URLs with fragments', () => {
    expect(() => parseGithubRepoUrl('https://github.com/acme/repo#bottom')).toThrow();
  });

  it('rejects URLs with extra path segments', () => {
    expect(() => parseGithubRepoUrl('https://github.com/acme/repo/issues')).toThrow();
  });

  it('rejects empty owner or repository name', () => {
    expect(() => parseGithubRepoUrl('https://github.com//repo')).toThrow();
    expect(() => parseGithubRepoUrl('https://github.com/acme/')).toThrow();
  });

  it('trims leading/trailing whitespace', () => {
    const result = parseGithubRepoUrl('  https://github.com/acme/repo  ');
    expect(result).toEqual({
      owner: 'acme',
      name: 'repo',
      fullName: 'acme/repo',
      canonicalUrl: 'https://github.com/acme/repo',
    });
  });
});
