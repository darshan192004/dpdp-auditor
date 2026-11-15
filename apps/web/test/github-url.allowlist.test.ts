import { describe, expect, it } from 'vitest';
import { validateResolveInput } from '~~/shared/repo';

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
    expect(() => validateResolveInput({ githubUrl: 42 })).toThrow(
      'Enter a GitHub repository URL.',
    );
  });

  it('rejects non-object body', () => {
    expect(() => validateResolveInput(null)).toThrow(
      'The request body must be a JSON object.',
    );
    expect(() => validateResolveInput([])).toThrow(
      'The request body must be a JSON object.',
    );
    expect(() => validateResolveInput('string')).toThrow(
      'The request body must be a JSON object.',
    );
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
});