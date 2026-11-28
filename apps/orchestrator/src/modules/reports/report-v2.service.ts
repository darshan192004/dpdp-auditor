import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FindingsRepository } from '../findings/findings.repository.js';
import { RulePackService } from '../rule-pack/rule-pack.service.js';
import { ReportsRepository } from './reports.repository.js';
import { buildReportViewModel } from './report-view-model.js';
import { buildReportV2ViewModel } from './report-view-model-v2.js';
import type { ReportTemplateModel } from './report-template.js';

@Injectable()
export class ReportV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsRepository,
    private readonly findings: FindingsRepository,
    private readonly pack: RulePackService,
  ) {}

  async viewModel(orgId: string, reportId: string) {
    const report = await this.reports.findById(orgId, reportId);
    if (!report) throw new ApiError('NOT_FOUND', 'The report does not exist.');

    const base = buildReportViewModel({
      report,
      scan: report.scan,
      organization: report.organization,
      findings: await this.findings.topForScan(report.scanId, orgId),
    });
    const rows = await this.prisma.controlResult.findMany({
      where: { scanId: report.scanId, orgId },
      orderBy: { controlCode: 'asc' },
      include: { rule: { select: { section: true, remediationGuidance: true } } },
    });
    const loaded = await this.pack.loadV2();
    const facts = report.scan.facts as {
      inventory?: {
        signals?: Array<{
          detector: string;
          kind: string;
          path: string;
          line: number | null;
          token: string;
        }>;
      };
    };
    const inventorySignals = (facts.inventory?.signals ?? []).map((signal) => ({
      detector: signal.detector,
      kind: signal.kind,
      path: signal.path,
      line: signal.line,
      token: signal.token,
    }));

    return buildReportV2ViewModel({
      // The shared payload is structurally identical; Prisma JSON fields are
      // narrowed by the renderer's own validation at the v1 boundary.
      base: {
        ...base,
        scan: {
          ...base.scan,
          evidenceCoverage:
            report.scan.evidenceCoverage === null
              ? null
              : Number(report.scan.evidenceCoverage.toString()),
        },
      } as unknown as ReportTemplateModel,
      controlResults: rows.map((row) => ({
        controlCode: row.controlCode,
        section: row.rule.section,
        verdict: row.verdict,
        reasonCode: row.reasonCode,
        remediation: row.rule.remediationGuidance,
      })),
      inventory: {
        version: report.scan.inventoryVersion,
        status: report.scan.inventoryStatus,
        signals: inventorySignals,
        consentGatingRatio:
          report.scan.consentGatingRatio === null
            ? null
            : Number(report.scan.consentGatingRatio.toString()),
      },
      commencement: loaded.commencement,
      detectorVersions: report.scan.scannerVersions as Record<string, string>,
      provenanceSearches: [
        ...new Set(
          loaded.controls.flatMap((control) =>
            control.violationRules.map((rule) => rule.provenance.search),
          ),
        ),
      ].slice(0, 32),
    });
  }
}
