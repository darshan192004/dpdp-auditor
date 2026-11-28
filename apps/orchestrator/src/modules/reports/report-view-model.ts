import type { Organization, Report, Repository, Scan } from '@prisma/client';
import { toFindingView, type FindingWithRule } from '../findings/findings.service.js';
import { buildCoverageBanners } from '../scoring/coverage-banners.js';
import type { DetectorStatus } from '../scoring/control-evaluator.js';

const REPORT_DETECTOR_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'timed_out',
  'skipped',
]);

function normalizeDetectorStatuses(value: unknown): Record<string, DetectorStatus> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([name, status]) => [
      name,
      typeof status === 'string' && REPORT_DETECTOR_STATUSES.has(status)
        ? (status as DetectorStatus)
        : 'skipped',
    ]),
  );
}

function inventoryDetectorStatuses(facts: unknown): Record<string, DetectorStatus> {
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) return {};
  const inventory = (facts as Record<string, unknown>).inventory;
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) return {};
  return normalizeDetectorStatuses((inventory as Record<string, unknown>).detectorStatuses);
}

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
      evidenceCoverage:
        scan.evidenceCoverage === null ? null : Number(scan.evidenceCoverage?.toString() ?? 0),
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
    coverageBanners: buildCoverageBanners(
      {
        ...normalizeDetectorStatuses(scan.coverage ?? {}),
        ...inventoryDetectorStatuses(scan.facts),
      },
      Array.isArray(scan.unknownControls)
        ? scan.unknownControls.filter((code): code is string => typeof code === 'string')
        : [],
    ),
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
    primaryColor:
      typeof branding.primaryColor === 'string' &&
      /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(branding.primaryColor)
        ? branding.primaryColor
        : null,
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
