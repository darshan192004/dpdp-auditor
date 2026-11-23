import { describe, expect, it } from 'vitest';
import { fixtureAuditLogList } from '../server/utils/fixtures/audit';

describe('audit fixture date filtering', () => {
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
