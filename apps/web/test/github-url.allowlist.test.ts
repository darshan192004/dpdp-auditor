import { describe, expect, it } from 'vitest';
import { RepoInputError, validateResolveInput, validateSaveInput } from '~~/shared/repo';

// P2-09: Client-side repo input validation (shared between Nitro and browser).
describe('GitHub URL validation (P2-09)', () => {
  it('accepts https://github.com/owner/repo exactly', () => {
    const result = validateResolveInput({
      githubUrl: 'https://github.com/acme/payments-service',
    });
    expect(result.githubUrl).toBe('https://github.com/acme/payments-service');
  });

  it('accepts the same URL with a trailing .git', () => {
    const result = validateResolveInput({
      githubUrl: 'https://github.com/acme/repo.git',
    });
    expect(result.githubUrl).toBe('https://github.com/acme/repo.git');
  });

  it('rejects missing githubUrl', () => {
    expect(() => validateResolveInput({})).toThrow('Enter a GitHub repository URL.');
  });

  it('rejects empty githubUrl', () => {
    expect(() => validateResolveInput({ githubUrl: '' })).toThrow(
      'Enter a valid GitHub repository URL.',
    );
  });

  it('rejects non-string githubUrl', () => {
    expect(() => validateResolveInput({ githubUrl: 42 })).toThrow('Enter a GitHub repository URL.');
  });

  it('rejects non-object body', () => {
    expect(() => validateResolveInput(null)).toThrow('The request body must be a JSON object.');
    expect(() => validateResolveInput([])).toThrow('The request body must be a JSON object.');
    expect(() => validateResolveInput('string')).toThrow('The request body must be a JSON object.');
  });

  it('trims whitespace from the URL', () => {
    const result = validateResolveInput({
      githubUrl: '  https://github.com/acme/repo  ',
    });
    expect(result.githubUrl).toBe('https://github.com/acme/repo');
  });

  it('rejects excessively long URLs', () => {
    const longUrl = 'https://github.com/' + 'a'.repeat(2040);
    expect(() => validateResolveInput({ githubUrl: longUrl })).toThrow(
      'Enter a valid GitHub repository URL.',
    );
  });

  it.each([
    'not-a-url',
    'github.com/acme/payments-service',
    'https://gitlab.com/acme/payments-service',
    'http://github.com/acme/payments-service',
    'https://github.com/acme/payments-service?x=1',
    'https://github.com/acme/payments-service/tree/main',
  ])('rejects non-GitHub URL %s before the resolver call', (githubUrl) => {
    expect(() => validateResolveInput({ githubUrl })).toThrow(
      'Enter a valid GitHub repository URL.',
    );
    expect(() => validateSaveInput({ githubUrl })).toThrow('Enter a valid GitHub repository URL.');

    try {
      validateResolveInput({ githubUrl });
      throw new Error('expected validation to fail');
    } catch (cause) {
      expect(cause).toBeInstanceOf(RepoInputError);
      expect((cause as RepoInputError).path).toBe('githubUrl');
    }
  });

  it('accepts a trailing slash', () => {
    expect(validateResolveInput({ githubUrl: 'https://github.com/acme/repo/' }).githubUrl).toBe(
      'https://github.com/acme/repo/',
    );
  });
});
