import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface RetentionCounts {
  markedExpired: number;
  deletedScans: number;
  purgedSessions: number;
  clearedIdempotencyKeys: number;
}

/** database.md §9: idempotency keys are valid for 7 days. */
const IDEMPOTENCY_KEY_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One hourly retention pass (docs/database.md §9). Every phase is
   * WHERE-guarded, so re-running it affects nothing — idempotent by
   * construction. Tenant tables sit behind RLS (§7), so scan phases run one
   * transaction per organisation with `app.current_org` set; sessions have no
   * org column and are purged globally.
   */
  async run(): Promise<RetentionCounts> {
    const purgedSessions = await this.purgeSessions();

    const orgs = await this.prisma.organization.findMany({
      select: { id: true, retentionDays: true },
    });

    let markedExpired = 0;
    let deletedScans = 0;
    let clearedIdempotencyKeys = 0;
    for (const org of orgs) {
      const counts = await this.prisma.$transaction(async (tx) => {
        // set_config, not SET LOCAL: Prisma parameterizes interpolations and
        // PostgreSQL rejects parameters in SET (same lesson as P1-21 DDL).
        await tx.$executeRaw`SELECT set_config('app.current_org', ${org.id}, true)`;

        const marked = await tx.$executeRaw`
          UPDATE scans
          SET status = 'expired', updated_at = now()
          WHERE status IN ('completed', 'failed', 'cancelled')
            AND completed_at < now() - make_interval(days => ${org.retentionDays})`;

        const deleted = await tx.$executeRaw`
          DELETE FROM scans
          WHERE id IN (
            SELECT id FROM scans
            WHERE status = 'expired'
              AND updated_at < now() - interval '24 hours'
            LIMIT 500
          )`;

        const keys = await tx.scan.updateMany({
          where: {
            idempotencyKey: { not: null },
            createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_KEY_MS) },
          },
          data: { idempotencyKey: null },
        });

        return { marked, deleted, keys: keys.count };
      });
      markedExpired += counts.marked;
      deletedScans += counts.deleted;
      clearedIdempotencyKeys += counts.keys;
    }

    return { markedExpired, deletedScans, purgedSessions, clearedIdempotencyKeys };
  }

  /** database.md L567: expired, idle-beyond-limit, or revoked over 24 h. */
  private async purgeSessions(): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM sessions
      WHERE id IN (
        SELECT id FROM sessions
        WHERE absolute_expires_at < now()
           OR last_seen_at < now() - interval '30 minutes'
           OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '24 hours')
        LIMIT 500
      )`;
  }
}
