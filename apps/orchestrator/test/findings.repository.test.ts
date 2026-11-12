import { describe, expect, it, vi } from 'vitest';
import { FindingsRepository } from '../src/modules/findings/findings.repository.js';
import { listFindingsSchema, type ListFindings } from '../src/modules/findings/findings.schemas.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const FINDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function make() {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const update = vi.fn().mockResolvedValue({ id: FINDING_ID });
  const findFirst = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue({ id: 'log-1' });
  const prisma = {
    scannerFinding: { findMany, count, update, findFirst },
    remediationLog: { create },
  };
  const tx = {
    scannerFinding: { findMany, count, update, findFirst },
    remediationLog: { create },
  };
  const repo = new FindingsRepository(prisma as unknown as PrismaService);
  return { repo, prisma, tx, findMany, count, update, findFirst, create };
}

function input(
  overrides: Partial<Parameters<typeof listFindingsSchema.parse>[0]> = {},
): ListFindings {
  return listFindingsSchema.parse({ orgId: ORG_ID, scanId: SCAN_ID, ...overrides });
}

describe('FindingsRepository.list (P4-17)', () => {
  it('scopes to the organisation and scan with the default sort', async () => {
    const { repo, findMany, count } = make();

    await repo.list(ORG_ID, input());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_ID, scanId: SCAN_ID },
        orderBy: { severity: 'desc' },
        skip: 0,
        take: 50,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { orgId: ORG_ID, scanId: SCAN_ID } });
  });

  it('translates every documented filter', async () => {
    const { repo, findMany } = make();

    await repo.list(
      ORG_ID,
      input({
        severity: ['critical', 'high'],
        scanner: ['semgrep'],
        status: ['open', 'reopened'],
        section: ['8(4)', '6'],
        file: 'src/',
        q: 'logger',
        page: 3,
        pageSize: 25,
      }),
    );

    const args = findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      orgId: ORG_ID,
      scanId: SCAN_ID,
      severity: { in: ['critical', 'high'] },
      scanner: { in: ['semgrep'] },
      status: { in: ['open', 'reopened'] },
      filePath: { startsWith: 'src/' },
      OR: [
        { controlCode: { startsWith: 'DPDPA-8.4-' } },
        { controlCode: { startsWith: 'DPDPA-6-' } },
      ],
      AND: {
        OR: [
          { message: { contains: 'logger', mode: 'insensitive' } },
          { scannerRuleId: { contains: 'logger', mode: 'insensitive' } },
        ],
      },
    });
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
  });

  it.each([
    ['file', { filePath: 'asc' }],
    ['-lineStart', { lineStart: 'desc' }],
    ['-createdAt', { createdAt: 'desc' }],
    ['-severity', { severity: 'desc' }],
  ] as const)('sorts by %s', async (sort, expected) => {
    const { repo, findMany } = make();

    await repo.list(ORG_ID, input({ sort }));

    expect(findMany.mock.calls[0]?.[0].orderBy).toEqual(expected);
  });
});

describe('FindingsRepository writes', () => {
  it('reads, updates, and logs inside the caller transaction', async () => {
    const { repo, tx, findFirst, update, create } = make();

    await repo.findById(ORG_ID, FINDING_ID, tx as never);
    await repo.update(FINDING_ID, { status: 'fixed' }, tx as never);
    await repo.addRemediationLog(
      {
        findingId: FINDING_ID,
        orgId: ORG_ID,
        actorUserId: null,
        action: 'triage',
        note: null,
        externalUrl: null,
      },
      tx as never,
    );

    expect(findFirst).toHaveBeenCalledWith({ where: { id: FINDING_ID, orgId: ORG_ID } });
    expect(update).toHaveBeenCalledWith({
      where: { id: FINDING_ID },
      data: { status: 'fixed' },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        findingId: FINDING_ID,
        orgId: ORG_ID,
        actorUserId: null,
        action: 'triage',
        note: null,
        externalUrl: null,
      },
    });
  });
});
