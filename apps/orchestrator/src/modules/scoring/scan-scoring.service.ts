import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Scan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Control, Mapping, Severity } from '../rule-pack/rule-pack.schemas.js';
import { RulePackService } from '../rule-pack/rule-pack.service.js';
import type { LoadedRulePack } from '../rule-pack/rule-pack.loader.js';
import { resolveMappings, type FindingStatus } from './mapping.resolver.js';
import { scoreScan, type ScoreCounts } from './scoring.engine.js';
import { isSuppressed } from './suppression.js';
import type { RepoFacts } from './applicability.js';

export interface MapAndScoreResult {
  score: number | null;
  grade: string | null;
  sectionScores: Record<string, number | null>;
  counts: Pick<ScoreCounts, 'critical' | 'high' | 'medium' | 'low' | 'info' | 'total'>;
  coverage: 'full' | 'partial';
  rulePackVersion: string;
  scoringVersion: string;
  findings: {
    mapped: number;
    unmapped: number;
    suppressed: number;
    new: number;
    persistent: number;
    reopened: number;
    resolved: number;
  };
}

interface Lifecycle {
  status: FindingStatus;
  isNew: boolean;
  firstSeenAt: Date;
}

/**
 * P4-06 / P4-09 / P4-10 / P4-11.
 *
 * Turns the runner's raw findings into DPDPA-mapped findings, compares them
 * with the previous completed scan of the same repository, and persists the
 * deterministic score. Runs inside the completion transaction so a scan never
 * ends up half-mapped.
 */
@Injectable()
export class ScanScoringService {
  private readonly logger = new Logger(ScanScoringService.name);
  private persisted: Promise<Map<string, string>> | undefined;

  constructor(
    private readonly pack: RulePackService,
    private readonly prisma: PrismaService,
  ) {}

  async mapAndScore(
    scan: Scan,
    facts: RepoFacts,
    coverage: Record<string, string>,
    tx: Prisma.TransactionClient,
  ): Promise<MapAndScoreResult> {
    const loaded = await this.pack.load();
    const ruleIds = await this.ensureRules(loaded);
    const raw = await tx.scannerFinding.findMany({
      where: { scanId: scan.id },
      orderBy: { id: 'asc' },
    });
    const lifecycle = await this.previousLifecycle(scan, tx);

    const now = new Date();
    const scored: { controlCode: string | null; severity: Severity; status: FindingStatus }[] = [];
    const currentFingerprints = new Set<string>();
    const tally = {
      mapped: 0,
      unmapped: 0,
      suppressed: 0,
      new: 0,
      persistent: 0,
      reopened: 0,
    };

    for (const row of raw) {
      const mapped = resolveMappings(
        {
          scanner: row.scanner,
          scannerRuleId: row.scannerRuleId,
          scannerRuleVersion: row.scannerRuleVersion ?? undefined,
          scannerSeverity: row.severity,
          filePath: row.filePath,
          lineStart: row.lineStart,
          lineEnd: row.lineEnd,
          message: row.message,
          evidenceHash: row.evidenceHash,
          fingerprint: row.fingerprint,
          context: asRecord(row.context),
        },
        loaded.mappings,
        loaded.controlsByCode,
      );

      const rows = mapped
        .filter((finding) => {
          const suppressed = isSuppressed(
            {
              scanner: finding.scanner,
              controlCode: finding.controlCode,
              filePath: finding.filePath,
              evidenceHash: finding.evidenceHash,
            },
            loaded.suppressions,
            now,
          );
          if (suppressed) tally.suppressed += 1;
          return !suppressed;
        })
        .map((finding, index) => ({
          finding,
          row: index === 0 ? row : undefined,
        }));

      // Every mapping for this raw finding was suppressed: drop the row rather
      // than leaving it behind as an unmapped finding.
      if (mapped.length > 0 && rows.length === 0) {
        await tx.scannerFinding.delete({ where: { id: row.id } });
        continue;
      }

      for (const { finding, row: existing } of rows) {
        const previous = lifecycle.get(finding.fingerprint);
        const status: FindingStatus =
          previous === undefined
            ? 'open'
            : previous.status === 'fixed'
              ? 'reopened'
              : previous.status;
        const seen: Lifecycle = {
          status,
          isNew: previous === undefined,
          firstSeenAt: previous?.firstSeenAt ?? now,
        };

        const data = {
          controlCode: finding.controlCode,
          dpdpaRuleId: finding.controlCode ? (ruleIds.get(finding.controlCode) ?? null) : null,
          severity: finding.severity,
          confidence: finding.confidence,
          fingerprint: finding.fingerprint,
          status: seen.status,
          isNew: seen.isNew,
          firstSeenAt: seen.firstSeenAt,
          lastSeenAt: now,
          context: {
            ...finding.context,
            ...(finding.rationale === null ? {} : { rationale: finding.rationale }),
            ...(finding.remediation === null ? {} : { remediation: finding.remediation }),
          } as Prisma.InputJsonValue,
        };

        if (existing) {
          await tx.scannerFinding.update({ where: { id: existing.id }, data });
        } else {
          await tx.scannerFinding.create({
            data: {
              ...data,
              scanId: scan.id,
              orgId: scan.orgId,
              scanner: finding.scanner,
              scannerRuleId: finding.scannerRuleId,
              scannerRuleVersion: finding.scannerRuleVersion,
              filePath: finding.filePath,
              lineStart: finding.lineStart,
              lineEnd: finding.lineEnd,
              message: finding.message,
              evidenceRedacted: row.evidenceRedacted,
              evidenceHash: finding.evidenceHash,
            },
          });
        }

        currentFingerprints.add(finding.fingerprint);
        scored.push({ controlCode: finding.controlCode, severity: finding.severity, status });
        if (finding.controlCode === null) tally.unmapped += 1;
        else tally.mapped += 1;
        if (seen.isNew) tally.new += 1;
        else if (seen.status === 'reopened') tally.reopened += 1;
        else tally.persistent += 1;
      }
    }

    // P4-13: unmapped findings are a platform-quality signal; a spike means the
    // pinned scanner emitted a rule the pack no longer knows about.
    if (tally.unmapped > 0) {
      this.logger.warn(
        `mapping_miss scan=${scan.id} count=${tally.unmapped} rule_pack=${loaded.pack}`,
      );
    }

    const coverageMode = coverageFor(coverage);
    const result = scoreScan({
      findings: scored,
      controls: loaded.controls,
      facts,
      coverage: coverageMode,
      sectionWeights: loaded.sectionWeights,
      grades: loaded.grades,
    });

    const resolved = [...lifecycle.keys()].filter(
      (fingerprint) => !currentFingerprints.has(fingerprint),
    ).length;
    const counts = {
      critical: result.counts.critical,
      high: result.counts.high,
      medium: result.counts.medium,
      low: result.counts.low,
      info: result.counts.info,
      total: result.counts.total,
    };

    return {
      score: result.score,
      grade: result.grade,
      sectionScores: result.sectionScores,
      counts,
      coverage: coverageMode,
      rulePackVersion: loaded.pack,
      scoringVersion: loaded.scoringVersion,
      findings: { ...tally, resolved },
    };
  }

  /** Score-only pass for triage and rescore, from the persisted findings. */
  async scorePersisted(
    scan: Scan,
    facts: RepoFacts,
    tx: Prisma.TransactionClient,
    findings?: readonly { controlCode: string | null; severity: Severity; status: FindingStatus }[],
  ) {
    const loaded = await this.pack.load();
    const rows =
      findings ??
      (await tx.scannerFinding.findMany({
        where: { scanId: scan.id },
        select: { controlCode: true, severity: true, status: true },
      }));
    return {
      loaded,
      result: scoreScan({
        findings: rows,
        controls: loaded.controls,
        facts,
        coverage: coverageFor(scan.coverage),
        sectionWeights: loaded.sectionWeights,
        grades: loaded.grades,
      }),
    };
  }

  /**
   * P4-03 materialisation: the signed pack is the source of truth, and these
   * rows exist so findings can hold a foreign key and the UI can query by
   * section. Idempotent, and cached per process after the first success.
   */
  private ensureRules(loaded: LoadedRulePack): Promise<Map<string, string>> {
    this.persisted ??= this.prisma.$transaction(async (tx) => {
      const ids = new Map<string, string>();
      for (const control of loaded.controls) {
        const rule = await tx.dpdpaRule.upsert({
          where: { code: control.code },
          create: { code: control.code, ...ruleRow(control, loaded.pack) },
          update: ruleRow(control, loaded.pack),
        });
        ids.set(control.code, rule.id);
      }
      for (const mapping of loaded.mappings) {
        const dpdpaRuleId = ids.get(mapping.controlCode);
        if (!dpdpaRuleId) continue;
        await tx.ruleMapping.upsert({
          where: {
            scanner_scannerRuleId_scannerRuleVersion_dpdpaRuleId: {
              scanner: mapping.scanner,
              scannerRuleId: mapping.ruleId,
              scannerRuleVersion: mapping.scannerRuleVersion,
              dpdpaRuleId,
            },
          },
          create: { ...mappingRow(mapping, dpdpaRuleId) },
          update: mappingRow(mapping, dpdpaRuleId),
        });
      }
      return ids;
    });
    return this.persisted;
  }

  private async previousLifecycle(
    scan: Scan,
    tx: Prisma.TransactionClient,
  ): Promise<Map<string, Lifecycle>> {
    const previous = await tx.scan.findFirst({
      where: {
        orgId: scan.orgId,
        repositoryId: scan.repositoryId,
        status: 'completed',
        id: { not: scan.id },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });
    const lifecycle = new Map<string, Lifecycle>();
    if (!previous) return lifecycle;

    const rows = await tx.scannerFinding.findMany({
      where: { scanId: previous.id },
      select: { fingerprint: true, status: true, firstSeenAt: true },
    });
    for (const row of rows) {
      lifecycle.set(row.fingerprint, {
        status: row.status as FindingStatus,
        isNew: false,
        firstSeenAt: row.firstSeenAt,
      });
    }
    return lifecycle;
  }
}

/** rules.md §9.5: any non-completed scanner makes the scan partial. */
export function coverageFor(coverage: unknown): 'full' | 'partial' {
  if (coverage === null || typeof coverage !== 'object') return 'full';
  const values = Object.values(coverage as Record<string, unknown>);
  if (values.length === 0) return 'full';
  return values.every((value) => value === 'completed') ? 'full' : 'partial';
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function ruleRow(control: Control, pack: string) {
  return {
    section: control.section,
    title: control.title,
    summary: control.summary,
    obligation: control.obligation,
    legalReference: control.legalReference,
    severity: control.severity,
    weight: new Prisma.Decimal(control.weight),
    appliesWhen: control.appliesWhen as Prisma.InputJsonValue,
    remediationGuidance: control.remediation,
    version: pack,
    isActive: true,
  };
}

function mappingRow(mapping: Mapping, dpdpaRuleId: string) {
  return {
    dpdpaRuleId,
    scanner: mapping.scanner,
    scannerRuleId: mapping.ruleId,
    scannerRuleVersion: mapping.scannerRuleVersion,
    confidence: mapping.confidence,
    rationale: mapping.rationale,
    remediationTemplate: mapping.remediationTemplate,
    isActive: true,
  };
}
