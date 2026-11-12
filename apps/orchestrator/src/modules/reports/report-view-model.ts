import type { Organization, Report, Repository, Scan } from '@prisma/client';
import { toFindingView, type FindingWithRule } from '../findings/findings.service.js';

export const REPORT_DISCLAIMER =
  'The mapping is a technical aid. It is not legal advice, not a legal opinion, and not a ' +
  'certification of compliance. DPDPA obligations depend on facts outside the repository, ' +
  'including notices, consents, contracts, and processing purposes. Customers must validate ' +
  'findings with qualified counsel.';

export const REPORT_METHODOLOGY =
  'Scores are derived from the signed DPDPA rule pack. Each applicable control contributes its ' +
  'weight to its section; a section score is the share of applicable weight without an active ' +
  'finding. The overall score is the weighted mean of assessed sections. A scan with incomplete ' +
  'scanner coverage reports a provisional score and withholds the grade.';

export const MAX_REPORT_FINDINGS = 200;

export interface ReportSource {
  report: Report;
  scan: Scan & { repository: Repository };
  organization: Organization;
  findings: readonly FindingWithRule[];
  now?: Date;
}

/**
 * P4-20. One payload shared by the dashboard and the PDF renderer. It never
 * contains source code or secret values: findings carry only the redacted
 * evidence the scanner already produced.
 */
export function buildReportViewModel(source: ReportSource) {
  const { report, scan, organization } = source;
  const branding = brandingFor(organization.settings);

  return {
    report: {
      id: report.id,
      format: report.format,
      templateVersion: report.templateVersion,
      createdAt: report.createdAt,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      dataRegion: organization.dataRegion,
      branding,
    },
    scan: {
      id: scan.id,
      repository: {
        id: scan.repository.id,
        fullName: scan.repository.fullName,
        visibility: scan.repository.visibility,
      },
      ref: scan.ref,
      commitSha: scan.commitSha,
      status: scan.status,
      score: scan.score === null ? null : Number(scan.score),
      grade: scan.grade,
      sectionScores: scan.sectionScores,
      counts: scan.counts,
      coverage: scan.coverage,
      coverageStatus: scan.coverageStatus,
      scannerVersions: scan.scannerVersions,
      rulePackVersion: scan.rulePackVersion,
      scoringVersion: scan.scoringVersion,
      timestamps: {
        queuedAt: scan.queuedAt,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        durationMs: scan.durationMs,
      },
    },
    topFindings: source.findings.slice(0, MAX_REPORT_FINDINGS).map(toFindingView),
    methodology: {
      scoringVersion: scan.scoringVersion,
      rulePackVersion: scan.rulePackVersion,
      summary: REPORT_METHODOLOGY,
    },
    disclaimer: REPORT_DISCLAIMER,
    generatedAt: source.now ?? new Date(),
  };
}

export interface Branding {
  logoUrl: string | null;
  primaryColor: string | null;
  footerText: string | null;
}

/** Branding is optional per tenant; absent or malformed settings fall back to null. */
export function brandingFor(settings: unknown): Branding {
  const root = asRecord(settings);
  const branding = asRecord(root.branding);
  return {
    logoUrl: text(branding.logoUrl),
    primaryColor: text(branding.primaryColor),
    footerText: text(branding.footerText),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
