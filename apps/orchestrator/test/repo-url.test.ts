import { describe, expect, it } from 'vitest';
import { parseGithubRepoUrl } from '../src/modules/repos/repo-url.js';

describe('parseGithubRepoUrl', () => {
  it.each([
    ['https://github.com/acme/payments-service', 'acme', 'payments-service'],
    ['https://github.com/acme/payments-service.git', 'acme', 'payments-service'],
    ['  https://github.com/acme/payments-service/  ', 'acme', 'payments-service'],
    ['https://GitHub.com/acme/repo_1.2', 'acme', 'repo_1.2'],
  ])('accepts %s', (input, owner, name) => {
    expect(parseGithubRepoUrl(input)).toEqual({
      owner,
      name,
      fullName: `${owner}/${name}`,
      canonicalUrl: `https://github.com/${owner}/${name}`,
    });
  });

  it.each([
    ['not a url'],
    ['http://github.com/acme/repo'],
    ['ftp://github.com/acme/repo'],
    ['https://github.com.evil.example/acme/repo'],
    ['https://github.com:8443/acme/repo'],
    ['https://user:pass@github.com/acme/repo'],
    ['https://github.com/acme/repo?ref=main'],
    ['https://github.com/acme/repo#readme'],
    ['https://github.com/acme'],
    ['https://github.com/acme/repo/extra'],
    ['https://github.com/-acme/repo'],
    ['https://github.com/acme/.'],
    ['https://github.com/acme/..'],
    ['https://github.com/acme/%2e%2e'],
  ])('rejects %s', (input) => {
    expect(() => parseGithubRepoUrl(input)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
