import { describe, expect, it, vi } from 'vitest';
import { resolveRepoSchema, saveRepoSchema } from '../src/modules/repos/repo.schemas.js';
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
    await expect(parseGithubRepoUrl('http://github.com/acme/repo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects non-GitHub hosts', () => {
    await expect(parseGithubRepoUrl('https://gitlab.com/acme/repo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects URLs with query parameters', () => {
    await expect(parseGithubRepoUrl('https://github.com/acme/repo?ref=main')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects URLs with fragments', () => {
    await expect(parseGithubRepoUrl('https://github.com/acme/repo#readme')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects URLs with ports', () => {
    await expect(parseGithubRepoUrl('https://github.com:8443/acme/repo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects URLs with credentials', () => {
    await expect(parseGithubRepoUrl('https://user:pass@github.com/acme/repo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects URLs with extra path segments', () => {
    await expect(parseGithubRepoUrl('https://github.com/acme/repo/extra')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects malformed owner names (leading/trailing hyphens)', () => {
    await expect(parseGithubRepoUrl('https://github.com/-acme/repo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(parseGithubRepoUrl('https://github.com/acme-/repo')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects overly long owner (40 chars) and repo (101 chars)', () => {
    const longOwner = 'a'.repeat(40);
    await expect(parseGithubRepoUrl(`https://github.com/${longOwner}/repo`)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const longRepo = 'a'.repeat(101);
    await expect(parseGithubRepoUrl(`https://github.com/acme/${longRepo}`)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects malformed URLs', () => {
    await expect(parseGithubRepoUrl('not a url')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects empty strings', () => {
    await expect(parseGithubRepoUrl('')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});