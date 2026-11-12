import { describe, expect, it, vi } from 'vitest';
import { defaultGitRunner } from '../src/modules/repos/repo-resolver.service.js';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

describe('defaultGitRunner', () => {
  it('runs git ls-remote with no shell and disables prompts', async () => {
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, result?: { stdout: string }) => void,
      ) => callback(null, { stdout: 'ref: refs/heads/main\tHEAD\n' }),
    );

    await expect(defaultGitRunner('https://github.com/acme/repo')).resolves.toContain(
      'refs/heads/main',
    );

    const [file, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    expect(file).toBe('git');
    expect(args).toEqual(['ls-remote', '--symref', 'https://github.com/acme/repo', 'HEAD']);
    expect(options.env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('propagates git failures', async () => {
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null) => void,
      ) => callback(new Error('not found')),
    );

    await expect(defaultGitRunner('https://github.com/acme/repo')).rejects.toThrow('not found');
  });
});
