import { beforeEach, describe, expect, it, vi } from 'vitest';

// P2-09: GitHub ls-remote probe to verify existence and read the default branch.
const MB = 1024 * 1024;

// Hoisted mock for child_process.execFile
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

// Import after the mock so the module sees the mocked execFile
import { defaultGitRunner, parseSymrefHead } from '../src/modules/repos/repo-resolver.service.js';

beforeEach(() => {
  execFileMock.mockReset();
});

describe('GitHub ls-remote probe (P2-09)', () => {
  it('parses the symref HEAD to get the default branch', () => {
    expect(parseSymrefHead('ref: refs/heads/develop\tHEAD\n')).toBe('develop');
    expect(parseSymrefHead('ref: refs/heads/main\tHEAD\nabc\tHEAD')).toBe('main');
    expect(parseSymrefHead('')).toBeNull();
    expect(parseSymrefHead('abc\tHEAD')).toBeNull();
  });

  it('runs git ls-remote with no shell and disables prompts', async () => {
    const stdout = 'ref: refs/heads/main\tHEAD\n';
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, result?: { stdout: string }) => void,
      ) => callback(null, { stdout }),
    );

    await expect(defaultGitRunner('https://github.com/acme/repo')).resolves.toContain(
      'refs/heads/main',
    );

    const [file, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string>; timeout: number; maxBuffer: number },
    ];
    expect(file).toBe('git');
    expect(args).toEqual(['ls-remote', '--symref', 'https://github.com/acme/repo', 'HEAD']);
    expect(options.env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(options.timeout).toBe(15_000);
    expect(options.maxBuffer).toBe(MB);
  });

  it('propagates git failures as repository-not-found', async () => {
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null) => void,
      ) => callback(new Error('repository not found')),
    );

    await expect(defaultGitRunner('https://github.com/acme/repo')).rejects.toThrow(
      'repository not found',
    );
  });
});
