import { describe, it, expect } from 'vitest';
import { parseGithubRepoUrl } from '../src/modules/repos/repo-url.js';
import { ApiError } from '../src/common/api-error.js';

/**
 * P6-02 — SSRF test suite
 *
 * Verifies that the URL resolver rejects every known SSRF vector before making
 * any network call. The endpoint never becomes an SSRF pivot because:
 *
 * - Only `https://github.com` is accepted (no suffix confusion)
 * - Credentials, ports, query parameters, and fragments are rejected
 * - Private IP ranges, loopback, and link-local addresses are blocked
 * - DNS rebinding cannot bypass the host check (checked at parse-time, not fetch-time)
 * - Extra path segments and `..` traversal are rejected
 */
describe('SSRF protection (P6-02)', () => {
  const validUrl = 'https://github.com/owner/repo';

  it('accepts a valid GitHub HTTPS URL', () => {
    const parsed = parseGithubRepoUrl(validUrl);
    expect(parsed.owner).toBe('owner');
    expect(parsed.name).toBe('repo');
    expect(parsed.canonicalUrl).toBe('https://github.com/owner/repo');
  });

  it('accepts URLs with .git suffix and normalizes them', () => {
    const parsed = parseGithubRepoUrl('https://github.com/owner/repo.git');
    expect(parsed.name).toBe('repo');
    expect(parsed.canonicalUrl).toBe('https://github.com/owner/repo');
  });

  it('accepts repository names with dots, underscores and hyphens', () => {
    const parsed = parseGithubRepoUrl('https://github.com/owner/my.repo-name_1');
    expect(parsed.name).toBe('my.repo-name_1');
  });

  it('trims leading and trailing whitespace', () => {
    const parsed = parseGithubRepoUrl('  https://github.com/owner/repo  ');
    expect(parsed.canonicalUrl).toBe('https://github.com/owner/repo');
  });

  describe('protocol enforcement', () => {
    it('rejects HTTP (non-HTTPS) URLs', () => {
      expect(() => parseGithubRepoUrl('http://github.com/owner/repo')).toThrow(ApiError);
    });

    it('rejects FTP URLs', () => {
      expect(() => parseGithubRepoUrl('ftp://github.com/owner/repo')).toThrow(ApiError);
    });

    it('rejects file:// URLs', () => {
      expect(() => parseGithubRepoUrl('file:///etc/passwd')).toThrow(ApiError);
    });

    it('rejects data: URIs', () => {
      expect(() => parseGithubRepoUrl('data:text/html,<h1>SSRF</h1>')).toThrow(ApiError);
    });
  });

  describe('hostname validation', () => {
    it('rejects github.com.evil.com (suffix confusion)', () => {
      expect(() => parseGithubRepoUrl('https://github.com.evil.com/owner/repo')).toThrow(ApiError);
    });

    it('rejects evil-github.com', () => {
      expect(() => parseGithubRepoUrl('https://evil-github.com/owner/repo')).toThrow(ApiError);
    });

    it('rejects localhost', () => {
      expect(() => parseGithubRepoUrl('https://localhost/owner/repo')).toThrow(ApiError);
    });

    it('rejects 127.0.0.1', () => {
      expect(() => parseGithubRepoUrl('https://127.0.0.1/owner/repo')).toThrow(ApiError);
    });

    it('rejects 0.0.0.0', () => {
      expect(() => parseGithubRepoUrl('https://0.0.0.0/owner/repo')).toThrow(ApiError);
    });

    it('rejects 169.254.169.254 (AWS metadata)', () => {
      expect(() => parseGithubRepoUrl('https://169.254.169.254/latest/meta-data/')).toThrow(
        ApiError,
      );
    });

    it('rejects 10.0.0.1 (private range)', () => {
      expect(() => parseGithubRepoUrl('https://10.0.0.1/owner/repo')).toThrow(ApiError);
    });

    it('rejects 192.168.1.1 (private range)', () => {
      expect(() => parseGithubRepoUrl('https://192.168.1.1/owner/repo')).toThrow(ApiError);
    });

    it('rejects 172.16.0.1 (private range)', () => {
      expect(() => parseGithubRepoUrl('https://172.16.0.1/owner/repo')).toThrow(ApiError);
    });

    it('rejects ::1 (IPv6 loopback)', () => {
      expect(() => parseGithubRepoUrl('https://[::1]/owner/repo')).toThrow(ApiError);
    });

    it('rejects IPv4-mapped IPv6 addresses', () => {
      expect(() => parseGithubRepoUrl('https://[::ffff:127.0.0.1]/owner/repo')).toThrow(ApiError);
    });

    it('rejects metalink (protocol-relative)', () => {
      expect(() => parseGithubRepoUrl('//github.com/owner/repo')).toThrow(ApiError);
    });
  });

  describe('port and credential rejection', () => {
    it('rejects URLs with non-standard ports', () => {
      expect(() => parseGithubRepoUrl('https://github.com:8443/owner/repo')).toThrow(ApiError);
    });

    it('rejects URLs with credentials', () => {
      expect(() => parseGithubRepoUrl('https://user:pass@github.com/owner/repo')).toThrow(ApiError);
    });

    it('rejects URLs with username only', () => {
      expect(() => parseGithubRepoUrl('https://user@github.com/owner/repo')).toThrow(ApiError);
    });
  });

  describe('query and fragment rejection', () => {
    it('rejects URLs with query parameters', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner/repo?redirect=evil')).toThrow(
        ApiError,
      );
    });

    it('rejects URLs with fragments', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner/repo#section')).toThrow(ApiError);
    });

    it('rejects URLs with both query and fragment', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner/repo?q=1#f')).toThrow(ApiError);
    });
  });

  describe('path traversal and extra segments', () => {
    it('rejects URLs with path traversal', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner/../../etc/passwd')).toThrow(
        ApiError,
      );
    });

    it('rejects URLs with extra path segments', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner/repo/settings')).toThrow(ApiError);
    });

    it('rejects URLs with single path segment', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner')).toThrow(ApiError);
    });

    it('rejects URLs with empty repository name', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner/')).toThrow(ApiError);
    });

    it('rejects owner or repo named "."', () => {
      expect(() => parseGithubRepoUrl('https://github.com/./repo')).toThrow(ApiError);
    });

    it('rejects owner or repo named ".."', () => {
      expect(() => parseGithubRepoUrl('https://github.com/../repo')).toThrow(ApiError);
    });
  });

  describe('owner and name validation', () => {
    it('rejects owner with leading hyphen', () => {
      expect(() => parseGithubRepoUrl('https://github.com/-owner/repo')).toThrow(ApiError);
    });

    it('rejects owner with trailing hyphen', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner-/repo')).toThrow(ApiError);
    });

    it('rejects owner with spaces', () => {
      expect(() => parseGithubRepoUrl('https://github.com/own er/repo')).toThrow(ApiError);
    });

    it('rejects owner with special characters', () => {
      expect(() => parseGithubRepoUrl('https://github.com/owner!@/repo')).toThrow(ApiError);
    });

    it('rejects owner exceeding 39 characters', () => {
      const longOwner = 'a'.repeat(40);
      expect(() => parseGithubRepoUrl(`https://github.com/${longOwner}/repo`)).toThrow(ApiError);
    });

    it('rejects repository name exceeding 100 characters', () => {
      const longName = 'a'.repeat(101);
      expect(() => parseGithubRepoUrl(`https://github.com/owner/${longName}`)).toThrow(ApiError);
    });

    it('rejects empty owner', () => {
      expect(() => parseGithubRepoUrl('https://github.com//repo')).toThrow(ApiError);
    });
  });

  describe('invalid URL formats', () => {
    it('rejects empty strings', () => {
      expect(() => parseGithubRepoUrl('')).toThrow(ApiError);
    });

    it('rejects non-URL strings', () => {
      expect(() => parseGithubRepoUrl('not a url')).toThrow(ApiError);
    });

    it('rejects URLs with encoded characters in hostname', () => {
      expect(() => parseGithubRepoUrl('https://github%2Ecom/owner/repo')).toThrow(ApiError);
    });

    it('rejects URLs with Unicode confusables', () => {
      // Cyrillic "а" looks like Latin "a"
      expect(() => parseGithubRepoUrl('https://gіithub.com/owner/repo')).toThrow(ApiError);
    });
  });

  describe('canonical output', () => {
    it('always produces https://github.com/owner/repo format', () => {
      const inputs = [
        'https://github.com/owner/repo',
        'https://github.com/owner/repo.git',
        '  https://github.com/owner/repo  ',
      ];

      for (const input of inputs) {
        const parsed = parseGithubRepoUrl(input);
        expect(parsed.canonicalUrl).toBe('https://github.com/owner/repo');
      }
    });

    it('produces correct fullName for nested-like names', () => {
      const parsed = parseGithubRepoUrl('https://github.com/facebook/react');
      expect(parsed.fullName).toBe('facebook/react');
    });
  });
});
