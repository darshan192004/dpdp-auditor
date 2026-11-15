import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';

const mockCreateContainer = vi.fn();
const mockGetContainer = vi.fn();

vi.mock('dockerode', () => {
  class Docker {
    constructor() {}
    createContainer = mockCreateContainer.mockResolvedValue({
      id: 'c1',
      start: vi.fn().mockResolvedValue(undefined),
    });
    getContainer = mockGetContainer.mockReturnValue({
      stop: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    });
  }
  return { default: Docker };
});

import { DockerRunner } from '../src/modules/runner/docker-driver.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  RUNNER_DRIVER: 'docker',
  SCANNERS_NAMESPACE: 'scanners',
  RUNNER_IMAGE: 'registry.example.com/dpdpa/scan-runner@sha256:test',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('DockerRunner', () => {
  it('creates a container and starts it', async () => {
    const runner = new DockerRunner(ENV);
    const id = await runner.start('s1', { TOKEN: 'abc' });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'scan-s1', Env: ['TOKEN=abc'] }),
    );
    expect(id).toBe('c1');
  });

  it('stops and removes the container on cancel', async () => {
    const runner = new DockerRunner(ENV);
    await runner.stop('s1');

    expect(mockGetContainer).toHaveBeenCalledWith('scan-s1');
  });
});
