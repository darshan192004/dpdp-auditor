import { describe, expect, it } from 'vitest';
import { fixtureAuditLogList, fixtureAuditLogNdjson } from '../server/utils/fixtures/audit';

describe('audit fixture date filtering', () => {
  it('matches action substrings case-insensitively while keeping exact filters literal', () => {
    expect(
      fixtureAuditLogList({ actionContains: 'TRIAG' }).data.map((row) => row.action),
    ).toContain('finding.triaged');
    expect(fixtureAuditLogList({ action: 'TRIAG' }).data).toEqual([]);
  });
  it('keeps the list-only action search out of the export', () => {
    expect(fixtureAuditLogNdjson({ actionContains: 'TRIAG' })).toBe(fixtureAuditLogNdjson({}));
    const exported = fixtureAuditLogNdjson({ action: 'finding.triaged', actionContains: 'absent' });
    expect(exported).toContain('finding.triaged');
    expect(exported).not.toContain('org.created');
  });
  it('compares instants so timezone offsets preserve inclusive date boundaries', () => {
    const row = fixtureAuditLogList({}).data[0]!;
    const instant = Date.parse(row.createdAt);
    const offsetTime = new Date(instant + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .replace('Z', '+05:30');
    const result = fixtureAuditLogList({ from: offsetTime, to: offsetTime });
    expect(result.data.map((entry) => entry.id)).toContain(row.id);
  });
});
