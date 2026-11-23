import { describe, expect, it } from 'vitest';
import { shapeCreatedScan } from '../server/utils/scan-response';

describe('shapeCreatedScan (docs/api.md §3.1)', () => {
  const upstream = {
    scanId: '573436d6-4fab-4f5a-be6f-73ba854733ba',
    status: 'queued',
    createdAt: '2026-11-18T09:35:09.181Z',
    replayed: false,
  };

  it('exposes data.id so the UI can navigate to the new scan', () => {
    const response = shapeCreatedScan(upstream, {
      repositoryId: 'repo_1',
      ref: 'main',
      profile: 'standard',
    });

    expect(response.data.id).toBe(upstream.scanId);
    expect(response.data.status).toBe('queued');
    expect(response.data.repositoryId).toBe('repo_1');
    expect(response.data.ref).toBe('main');
    expect(response.data.profile).toBe('standard');
    expect(response.data.links).toEqual({
      self: `/api/v1/scan/${upstream.scanId}`,
      findings: `/api/v1/scan/${upstream.scanId}/findings`,
      events: `/api/v1/scan/${upstream.scanId}/events`,
    });
  });

  it('is JSON-safe and keeps the source when a URL was submitted', () => {
    const response = shapeCreatedScan(upstream, {
      githubUrl: 'https://github.com/666ghj/MiroFish',
    });

    expect(() => JSON.stringify(response)).not.toThrow();
    expect(response.data.githubUrl).toBe('https://github.com/666ghj/MiroFish');
    expect(response.data.repositoryId).toBeUndefined();
  });
});
