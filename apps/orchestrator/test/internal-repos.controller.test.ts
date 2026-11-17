import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InternalReposController } from '../src/modules/repos/internal-repos.controller.js';
import { ReposService } from '../src/modules/repos/repos.service.js';

const repos = {
  resolve: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  disconnect: vi.fn(),
};
const controller = new InternalReposController(repos as unknown as ReposService);
const githubUrl = 'https://github.com/example/project';
beforeEach(() => vi.resetAllMocks());

describe('repository controller tenant and request boundaries', () => {
  it('uses trusted organization and actor headers over untrusted body fields', async () => {
    const body = { githubUrl, orgId: 'foreign', actorUserId: 'forged' };
    repos.resolve.mockResolvedValue({ githubUrl });
    expect(await controller.resolve('trusted', body)).toEqual({ data: { githubUrl } });
    expect(repos.resolve).toHaveBeenCalledWith({
      githubUrl,
      orgId: 'trusted',
      actorUserId: 'forged',
    });
    await controller.save('trusted', 'actor', body);
    expect(repos.save).toHaveBeenCalledWith({ githubUrl, orgId: 'trusted', actorUserId: 'actor' });
    await controller.save('trusted', undefined, body);
    expect(repos.save).toHaveBeenLastCalledWith({ githubUrl, orgId: 'trusted', actorUserId: null });
  });

  it.each([
    [undefined, undefined, 1, 20],
    ['2', '50', 2, 50],
    ['', '', 1, 20],
  ])(
    'parses pagination %s/%s without changing tenant scope',
    async (page, size, expectedPage, expectedSize) => {
      repos.list.mockResolvedValue(['repo']);
      expect(await controller.list('trusted', page, size)).toEqual({ data: ['repo'] });
      expect(repos.list).toHaveBeenCalledWith({
        orgId: 'trusted',
        page: expectedPage,
        pageSize: expectedSize,
      });
    },
  );

  it('scopes detail lookup and preserves service errors', async () => {
    const error = new Error('not found');
    repos.detail.mockRejectedValue(error);
    await expect(controller.detail('trusted', 'foreign-repo')).rejects.toBe(error);
    expect(repos.detail).toHaveBeenCalledWith('trusted', 'foreign-repo');
  });

  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
    ['1', false],
  ])('only enables force deletion for %s', async (force, expected) => {
    await controller.disconnect('trusted', 'actor', 'repo', force);
    expect(repos.disconnect).toHaveBeenCalledWith({
      orgId: 'trusted',
      actorUserId: 'actor',
      repoId: 'repo',
      force: expected,
    });
  });

  it('records a missing actor as null', async () => {
    await controller.disconnect('trusted', undefined, 'repo');
    expect(repos.disconnect).toHaveBeenCalledWith({
      orgId: 'trusted',
      actorUserId: null,
      repoId: 'repo',
      force: false,
    });
  });

  it('rejects missing organization on every route before service access', async () => {
    const calls = [
      () => controller.resolve(undefined, { githubUrl }),
      () => controller.save(undefined, 'actor', { githubUrl }),
      () => controller.list(undefined),
      () => controller.detail(undefined, 'repo'),
      () => controller.disconnect(undefined, 'actor', 'repo'),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('X-Org-Id is required.');
    for (const method of Object.values(repos)) expect(method).not.toHaveBeenCalled();
  });
});
