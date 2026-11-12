import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma, Scan } from '@prisma/client';
import { loadRulePack, type LoadedRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';
import type { RulePackService } from '../src/modules/rule-pack/rule-pack.service.js';
import { coverageFor, ScanScoringService } from '../src/modules/scoring/scan-scoring.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const PACK_DIR = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const PREV_ID = '99999999-9999-4999-8999-999999999999';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '55555555-5555-4555-8555-555555555555';

const FACTS = {
  languages: ['python', 'typescript'],
  frameworks: ['django'],
  resourceTypes: ['aws_s3_bucket'],
};

interface Row {
  id: string;
  scanId: string;
  orgId: string;
  scanner: 'semgrep' | 'checkov' | 'gitleaks';
  scannerRuleId: string;
  scannerRuleVersion: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  message: string;
  evidenceRedacted: string | null;
  evidenceHash: string | null;
  fingerprint: string;
  status: string;
  isNew: boolean;
  firstSeenAt: Date;
  context: Record<string, unknown>;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'f1',
    scanId: SCAN_ID,
    orgId: ORG_ID,
    scanner: 'checkov',
    scannerRuleId: 'CKV_AWS_19',
    scannerRuleVersion: '3.2.334',
    severity: 'medium',
    filePath: 'infra/storage.tf',
    lineStart: 14,
    lineEnd: 28,
    message: 'S3 bucket is unencrypted',
    evidenceRedacted: null,
    evidenceHash: 'sha256:abc',
    fingerprint: 'fpt_1',
    status: 'open',
    isNew: true,
    firstSeenAt: new Date('2026-11-01T00:00:00.000Z'),
    context: { resourceType: 'aws_s3_bucket' },
    ...overrides,
  };
}

function scan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: SCAN_ID,
    orgId: ORG_ID,
    repositoryId: REPO_ID,
    requestedBy: null,
    apiKeyId: null,
    trigger: 'manual',
    status: 'mapping',
    ref: 'main',
    commitSha: null,
    scannerVersions: {},
    rulePackVersion: null,
    scoringVersion: null,
    score: null,
    grade: null,
    sectionScores: {},
    counts: {},
    coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
    coverageStatus: null,
    facts: {},
    errorCode: null,
    errorMessage: null,
    idempotencyKey: null,
    idempotencyHash: null,
    jobName: null,
    secretName: null,
    queuedAt: new Date('2026-11-12T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    updatedAt: new Date('2026-11-12T00:00:00.000Z'),
    ...overrides,
  };
}

function make(previous: Row[] | null = null, current: Row[] = [row()]) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const creates: Record<string, unknown>[] = [];
  const tx = {
    scan: {
      findFirst: vi.fn().mockResolvedValue(previous === null ? null : { id: PREV_ID }),
    },
    scannerFinding: {
      findMany: vi.fn(async ({ where }: { where: { scanId: string } }) =>
        where.scanId === PREV_ID ? previous : current,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          return { ...data, id: where.id };
        },
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        creates.push(data);
        return { ...data, id: `f${creates.length + 1}` };
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    dpdpaRule: {
      upsert: vi.fn(async ({ create }: { create: { code: string } }) => ({
        id: `rule-${create.code}`,
      })),
    },
    ruleMapping: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  let pack: LoadedRulePack;
  const packService = { load: async () => pack } as unknown as RulePackService;
  const service = new ScanScoringService(packService, prisma as unknown as PrismaService);
  return {
    service,
    tx,
    updates,
    creates,
    setPack: (loaded: LoadedRulePack) => {
      pack = loaded;
    },
  };
}

describe('ScanScoringService (P4-06, P4-10, P4-11)', () => {
  let pack: LoadedRulePack;

  beforeAll(async () => {
    pack = await loadRulePack(PACK_DIR);
  });

  it('persists one mapped finding with the control-suffixed fingerprint', async () => {
    const harness = make();
    harness.setPack(pack);

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.updates[0]?.data).toMatchObject({
      controlCode: 'DPDPA-8.4-ENC-01',
      dpdpaRuleId: 'rule-DPDPA-8.4-ENC-01',
      fingerprint: 'fpt_1:DPDPA-8.4-ENC-01',
      severity: 'high',
      isNew: true,
    });
    expect(result.findings).toMatchObject({ mapped: 1, unmapped: 0, new: 1 });
    expect(result.rulePackVersion).toBe('dpdpa-2026.10.1');
    expect(result.scoringVersion).toBe('1.0.0');
    expect(result.coverage).toBe('full');
    expect(result.grade).not.toBeNull();
  });

  it('carries triage status and first-seen time from the previous scan', async () => {
    const harness = make([row({ fingerprint: 'fpt_1:DPDPA-8.4-ENC-01', status: 'accepted_risk' })]);
    harness.setPack(pack);

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { checkov: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.updates[0]?.data).toMatchObject({
      status: 'accepted_risk',
      isNew: false,
      firstSeenAt: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(result.findings).toMatchObject({ persistent: 1, new: 0 });
  });

  it('reopens a previously fixed finding', async () => {
    const harness = make([row({ fingerprint: 'fpt_1:DPDPA-8.4-ENC-01', status: 'fixed' })]);
    harness.setPack(pack);

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { checkov: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.updates[0]?.data).toMatchObject({ status: 'reopened', isNew: false });
    expect(result.findings).toMatchObject({ reopened: 1, resolved: 0 });
  });

  it('counts fingerprints that disappeared as resolved', async () => {
    const harness = make([
      row({ fingerprint: 'fpt_1:DPDPA-8.4-ENC-01' }),
      row({ id: 'f2', fingerprint: 'gone:DPDPA-6-CONSENT-01' }),
    ]);
    harness.setPack(pack);

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { checkov: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(result.findings.resolved).toBe(1);
  });

  it('creates an extra row per control on fan-out', async () => {
    const harness = make(null, [row({ scannerRuleId: 'dpdpa.fanout.test', scanner: 'semgrep' })]);
    harness.setPack({
      ...pack,
      mappings: [
        ...pack.mappings,
        {
          scanner: 'semgrep',
          ruleId: 'dpdpa.fanout.test',
          scannerRuleVersion: '*',
          controlCode: 'DPDPA-8.4-LOG-01',
          confidence: 'direct',
          rationale: 'test mapping',
          remediationTemplate: null,
        },
        {
          scanner: 'semgrep',
          ruleId: 'dpdpa.fanout.test',
          scannerRuleVersion: '*',
          controlCode: 'DPDPA-6-CONSENT-01',
          confidence: 'inferred',
          rationale: 'test mapping',
          remediationTemplate: null,
        },
      ],
    });

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { semgrep: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(result.findings.mapped).toBe(2);
    expect(harness.updates.length).toBe(1);
    expect(harness.creates.length).toBe(1);
    expect(harness.updates[0]?.data.fingerprint).toBe('fpt_1:DPDPA-8.4-LOG-01');
    expect(harness.creates[0]?.fingerprint).toBe('fpt_1:DPDPA-6-CONSENT-01');
  });

  it('keeps unmapped findings and reports them separately', async () => {
    const harness = make(null, [row({ scannerRuleId: 'UNKNOWN_RULE' })]);
    harness.setPack(pack);

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { checkov: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.updates[0]?.data).toMatchObject({ controlCode: null, dpdpaRuleId: null });
    expect(result.findings).toMatchObject({ mapped: 0, unmapped: 1 });
  });

  it('withholds the grade but keeps the provisional score on partial coverage', async () => {
    const harness = make();
    harness.setPack(pack);

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { semgrep: 'completed', checkov: 'timed_out' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(result.coverage).toBe('partial');
    expect(result.grade).toBeNull();
    expect(result.score).not.toBeNull();
  });

  it('materialises the pack once per process', async () => {
    const harness = make();
    harness.setPack(pack);
    const tx = harness.tx as unknown as Prisma.TransactionClient;

    await harness.service.mapAndScore(scan(), FACTS, { checkov: 'completed' }, tx);
    await harness.service.mapAndScore(scan(), FACTS, { checkov: 'completed' }, tx);

    expect(harness.tx.dpdpaRule.upsert).toHaveBeenCalledTimes(pack.controls.length);
    expect(harness.tx.ruleMapping.upsert).toHaveBeenCalledTimes(pack.mappings.length);
  });

  it('drops a fully suppressed finding and counts it (P4-19)', async () => {
    const harness = make(null, [
      row({
        scanner: 'gitleaks',
        scannerRuleId: 'aws-access-token',
        filePath: 'services/tests/fixtures/key.py',
        evidenceHash: 'sha256:abc',
        fingerprint: 'fpt_secret',
      }),
    ]);
    harness.setPack({
      ...pack,
      suppressions: [
        {
          id: 'fixture-keys',
          paths: ['**/tests/fixtures/**'],
          scanners: ['gitleaks'],
          controls: ['DPDPA-8.4-SECRET-01'],
          matchHashes: ['sha256:abc'],
          reason: 'A reviewed fake fixture key that cannot authenticate.',
          reviewedBy: 'security@example.com',
          expiresAt: '2027-01-01',
        },
      ],
    });

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { gitleaks: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.tx.scannerFinding.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(harness.updates).toHaveLength(0);
    expect(result.findings).toMatchObject({ mapped: 0, suppressed: 1 });
  });

  it('keeps a secret whose evidence hash is not suppressed', async () => {
    const harness = make(null, [
      row({
        scanner: 'gitleaks',
        scannerRuleId: 'aws-access-token',
        filePath: 'services/tests/fixtures/key.py',
        evidenceHash: 'sha256:other',
        fingerprint: 'fpt_secret',
      }),
    ]);
    harness.setPack({
      ...pack,
      suppressions: [
        {
          id: 'fixture-keys',
          paths: ['**/tests/fixtures/**'],
          scanners: ['gitleaks'],
          controls: ['DPDPA-8.4-SECRET-01'],
          matchHashes: ['sha256:abc'],
          reason: 'A reviewed fake fixture key that cannot authenticate.',
          reviewedBy: 'security@example.com',
          expiresAt: '2027-01-01',
        },
      ],
    });

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { gitleaks: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.updates).toHaveLength(1);
    expect(result.findings).toMatchObject({ mapped: 1, suppressed: 0 });
  });

  it('suppresses a non-secret finding by path alone', async () => {
    const harness = make(null, [row({ filePath: 'tests/fixtures/main.tf' })]);
    harness.setPack({
      ...pack,
      suppressions: [
        {
          id: 'generated-iac',
          paths: ['**/tests/fixtures/**'],
          scanners: ['checkov'],
          controls: ['DPDPA-8.4-ENC-01'],
          matchHashes: [],
          reason: 'Reviewed fixture that is not deployed anywhere.',
          reviewedBy: 'security@example.com',
          expiresAt: '2027-01-01',
        },
      ],
    });

    const result = await harness.service.mapAndScore(
      scan(),
      FACTS,
      { checkov: 'completed' },
      harness.tx as unknown as Prisma.TransactionClient,
    );

    expect(harness.tx.scannerFinding.delete).toHaveBeenCalled();
    expect(result.findings.suppressed).toBe(1);
  });
});

describe('coverageFor', () => {
  it('is full when every scanner completed and partial otherwise', () => {
    expect(coverageFor({ semgrep: 'completed' })).toBe('full');
    expect(coverageFor({})).toBe('full');
    expect(coverageFor(null)).toBe('full');
    expect(coverageFor({ semgrep: 'completed', gitleaks: 'timed_out' })).toBe('partial');
  });
});
