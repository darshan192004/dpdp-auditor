import { Injectable } from '@nestjs/common';
import { Prisma, type DpdpaRule, type ScannerFinding } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ScansRepository } from '../scans/scans.repository.js';
import { factsFrom } from '../scoring/applicability.js';
import { ScanScoringService } from '../scoring/scan-scoring.service.js';
import { FindingsRepository } from './findings.repository.js';
import {
  listFindingsSchema,
  triageFindingSchema,
  type ListFindingsInput,
  type TriageFindingInput,
} from './findings.schemas.js';

export type FindingWithRule = ScannerFinding & { dpdpaRule: DpdpaRule | null };

/** api.md §4. P4-17 list, P4-18 triage with transactional audit + rescore. */
@Injectable()
export class FindingsService {
  constructor(
    private readonly findings: FindingsRepository,
    private readonly scans: ScansRepository,
    private readonly scoring: ScanScoringService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string, scanId: string, raw: Partial<ListFindingsInput>) {
    const input = listFindingsSchema.parse({ ...raw, orgId, scanId });
    const scan = await this.scans.findById(orgId, scanId);
    if (!scan) throw new ApiError('NOT_FOUND', 'The scan does not exist.');

    const { items, total } = await this.findings.list(orgId, input);
    return {
      data: items.map(toFindingView),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      },
    };
  }

  /**
   * P4-09: triage is per finding per scan. The status change, the remediation
   * log, the audit row, and the recomputed score commit together, so a scan can
   * never show a triage without its score or an audit trail.
   */
  async triage(orgId: string, findingId: string, raw: Partial<TriageFindingInput>) {
    const input = triageFindingSchema.parse({ ...raw, orgId, findingId });

    return this.prisma.$transaction(async (tx) => {
      const finding = await this.findings.findById(orgId, findingId, tx);
      if (!finding) throw new ApiError('NOT_FOUND', 'The finding does not exist.');

      const updated = await this.findings.update(finding.id, { status: input.status }, tx);
      const at = updated.updatedAt;

      await this.findings.addRemediationLog(
        {
          findingId: finding.id,
          orgId,
          actorUserId: input.actorUserId ?? null,
          action: 'triage',
          note: input.note ?? null,
          externalUrl: input.externalUrl ?? null,
        },
        tx,
      );

      await this.audit.record(
        {
          orgId,
          actorType: input.actorUserId ? 'user' : 'system',
          actorUserId: input.actorUserId ?? null,
          action: 'finding.triaged',
          resourceType: 'finding',
          resourceId: finding.id,
          metadata: { from: finding.status, to: input.status, scanId: finding.scanId },
        },
        tx,
      );

      await this.rescore(finding.scanId, orgId, tx);

      return {
        id: updated.id,
        status: updated.status,
        updatedAt: at,
        triage: {
          actor: input.actorUserId ?? null,
          note: input.note ?? null,
          at,
        },
      };
    });
  }

  /** rules.md §9.6: a triage change rewrites the derived score, not the scan history. */
  private async rescore(scanId: string, orgId: string, tx: Prisma.TransactionClient) {
    const scan = await this.scans.findById(orgId, scanId, tx);
    if (!scan) return;
    const { result } = await this.scoring.scorePersisted(scan, factsFrom(scan.facts), tx);
    await this.scans.update(
      scan.id,
      {
        score: result.score === null ? null : new Prisma.Decimal(result.score),
        grade: result.grade,
        sectionScores: result.sectionScores,
        counts: {
          critical: result.counts.critical,
          high: result.counts.high,
          medium: result.counts.medium,
          low: result.counts.low,
          info: result.counts.info,
          total: result.counts.total,
        },
        coverageStatus: result.coverage,
      },
      tx,
    );
    await this.scans.appendEvent(
      scan.id,
      orgId,
      'score_recomputed',
      {
        score: result.score,
        grade: result.grade,
        coverage: result.coverage,
        counts: {
          critical: result.counts.critical,
          high: result.counts.high,
          medium: result.counts.medium,
          low: result.counts.low,
          info: result.counts.info,
          total: result.counts.total,
        },
      },
      tx,
    );
  }
}

/** api.md §4.1 view model. Secrets never carry redacted evidence. */
export function toFindingView(finding: FindingWithRule) {
  const context = asRecord(finding.context);
  const rationale = typeof context.rationale === 'string' ? context.rationale : null;
  const remediation =
    typeof context.remediation === 'string'
      ? context.remediation
      : finding.dpdpaRule?.remediationGuidance;

  return {
    id: finding.id,
    scanId: finding.scanId,
    scanner: finding.scanner,
    scannerRuleId: finding.scannerRuleId,
    severity: finding.severity,
    confidence: finding.confidence,
    status: finding.status,
    isNew: finding.isNew,
    filePath: finding.filePath,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    message: finding.message,
    evidence: {
      ...(finding.scanner === 'gitleaks' || finding.evidenceRedacted === null
        ? {}
        : { redacted: finding.evidenceRedacted }),
      hash: finding.evidenceHash,
    },
    dpdpa:
      finding.controlCode === null
        ? null
        : {
            code: finding.controlCode,
            section: finding.dpdpaRule?.section ?? sectionOf(finding.controlCode),
            title: finding.dpdpaRule?.title ?? finding.controlCode,
            severity: finding.dpdpaRule?.severity ?? finding.severity,
            rationale,
          },
    remediation: remediation === null ? null : { summary: remediation, steps: [] },
  };
}

/** `DPDPA-8.4-ENC-01` -> `8(4)`; the code is the stable identifier. */
export function sectionOf(controlCode: string): string {
  const parts = controlCode.replace(/^DPDPA-/, '').split('-');
  const section = parts[0] ?? '';
  return section.includes('.') ? section.replace('.', '(') + ')' : section;
}

function asRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
