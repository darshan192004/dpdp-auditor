import { describe, expect, it } from 'vitest';
import { fixtureScanList, FIXTURE_SCANS } from '../server/utils/fixtures/scans';
import type { ScanDetail } from '../shared/scan';

const source: ScanDetail[] = Array.from({ length: 25 }, (_, index) => ({
  ...structuredClone(FIXTURE_SCANS[0]!),
  id: `scan-${String(index).padStart(2, '0')}`,
  status: index < 5 ? 'failed' : 'completed',
  score: index,
  timestamps: {
    ...FIXTURE_SCANS[0]!.timestamps,
    queuedAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
  },
}));

describe('scan list fixture contract', () => {
  it('filters before pagination and returns accurate totals with more than twenty scans', () => {
    expect(fixtureScanList({ page: '2' }, source).items).toHaveLength(5);
    const filtered = fixtureScanList({ status: 'failed' }, source);
    expect(filtered.items).toHaveLength(5);
    expect(filtered.items.every((scan) => scan.status === 'failed')).toBe(true);
    expect(filtered.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 5, totalPages: 1 });
    expect(fixtureScanList({ status: 'failed', page: '2' }, source).items).toEqual([]);
  });
  it('honors repository, inclusive chronological bounds, sorting and page size', () => {
    const page = fixtureScanList(
      {
        repositoryId: source[0]!.repository.id,
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-01T00:04:00Z',
        sort: 'score',
        pageSize: '2',
        page: '2',
      },
      source,
    );
    expect(page.items.map((scan) => scan.score)).toEqual([2, 3]);
    expect(page.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 5, totalPages: 3 });
    expect(
      fixtureScanList({ repositoryId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, source).items,
    ).toEqual([]);
    expect(
      fixtureScanList({ sort: '-score', pageSize: '2' }, source).items.map((scan) => scan.score),
    ).toEqual([24, 23]);
    expect(
      fixtureScanList({ sort: 'createdAt', pageSize: '2' }, source).items.map((scan) => scan.score),
    ).toEqual([0, 1]);
  });
  it('matches repository UUIDs regardless of case in queries or fixture data', () => {
    const lower = source[0]!.repository.id.toLowerCase();
    const expected = fixtureScanList({ repositoryId: lower }, source);
    expect(expected.pagination.totalItems).toBe(25);
    expect(fixtureScanList({ repositoryId: lower.toUpperCase() }, source)).toEqual(expected);
    const uppercaseSource = source.map((scan) => ({
      ...scan,
      repository: { ...scan.repository, id: scan.repository.id.toUpperCase() },
    }));
    expect(fixtureScanList({ repositoryId: lower }, uppercaseSource).pagination.totalItems).toBe(
      25,
    );
  });

  it.each([
    { page: '0' },
    { pageSize: '101' },
    { sort: 'unknown' },
    { status: 'unknown' },
    { from: 'bad-date' },
    { repositoryId: 'bad-id' },
  ])('rejects malformed query values: %j', (query) => {
    expect(() => fixtureScanList(query)).toThrow();
  });
});
