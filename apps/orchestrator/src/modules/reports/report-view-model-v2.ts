import type { ReportTemplateModel } from './report-template.js';

export const REPORT_V2_SECTION_IDS = [
  'executive_summary',
  'gaps_by_section',
  'evidence_of_safeguards',
  'could_not_determine',
  'data_inventory_summary',
  'fix_plan',
  'methodology',
  'limitations',
  'disclaimer',
] as const;

export interface ReportV2ControlResult {
  controlCode: string;
  section: string;
  verdict: string;
  reasonCode: string;
  remediation: string;
}

export interface ReportV2Input {
  base: ReportTemplateModel;
  controlResults: readonly ReportV2ControlResult[];
  inventory: {
    version: string | null;
    status: string | null;
    signals: readonly {
      detector: string;
      kind: string;
      path: string;
      line: number | null;
      token: string;
    }[];
    consentGatingRatio: number | null;
  } | null;
  commencement: readonly {
    provision: string;
    effectiveFrom: string;
    sourceUrl: string;
    verifiedOn: string;
  }[];
  detectorVersions: Readonly<Record<string, string>>;
  provenanceSearches: readonly string[];
}

interface SectionRow {
  controlCode?: string;
  section?: string;
  verdict?: string;
  reasonCode?: string;
  remedy?: string;
}

export interface ReportV2Section {
  id: (typeof REPORT_V2_SECTION_IDS)[number];
  title: string;
  rows?: SectionRow[];
  groups?: Array<{ section: string; rows: SectionRow[] }>;
  table?: ReportV2Input['commencement'][number][];
  text?: string;
}

/**
 * Nine ordered, readiness-only sections. Attested verdicts never enter the
 * evidence section, and unknown controls are kept in their own prominent
 * section rather than being collapsed into a pass.
 */
export function buildReportV2ViewModel(input: ReportV2Input) {
  const { base } = input;
  const gaps = input.controlResults.filter((row) =>
    ['FAIL', 'PARTIAL', 'ATTESTED_FAIL'].includes(row.verdict),
  );
  const evidence = input.controlResults.filter((row) => ['PASS', 'PARTIAL'].includes(row.verdict));
  const unknown = input.controlResults.filter((row) => row.verdict === 'UNKNOWN');
  const grouped = new Map<string, SectionRow[]>();
  for (const row of gaps) {
    const items = grouped.get(row.section) ?? [];
    items.push({
      controlCode: row.controlCode,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
    });
    grouped.set(row.section, items);
  }
  const sections: ReportV2Section[] = [
    {
      id: 'executive_summary',
      title: 'Executive readiness summary',
      rows: [
        {
          section: 'score',
          remedy: base.scan.score === null ? 'Not assessed' : base.scan.score.toFixed(1),
        },
        { section: 'evidence coverage', remedy: String(base.scan.evidenceCoverage ?? null) },
        { section: 'open gaps', remedy: String(gaps.length) },
      ],
      table: [...input.commencement],
    },
    {
      id: 'gaps_by_section',
      title: 'Gaps grouped by section',
      groups: [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([section, rows]) => ({ section, rows })),
    },
    {
      id: 'evidence_of_safeguards',
      title: 'Evidence of safeguards',
      rows: evidence.map((row) => ({
        controlCode: row.controlCode,
        section: row.section,
        verdict: row.verdict,
      })),
    },
    {
      id: 'could_not_determine',
      title: 'Could not determine',
      rows: unknown.map((row) => ({
        controlCode: row.controlCode,
        section: row.section,
        reasonCode: row.reasonCode,
      })),
    },
    {
      id: 'data_inventory_summary',
      title: 'Data inventory summary',
      text:
        input.inventory === null
          ? 'No inventory was recorded for this scan.'
          : `${input.inventory.signals.length} bounded signals at ${input.inventory.version ?? 'unknown version'}; consent gating ${input.inventory.consentGatingRatio ?? 'not determined'}.`,
    },
    {
      id: 'fix_plan',
      title: 'Fix plan',
      rows: gaps.map((row) => ({
        controlCode: row.controlCode,
        section: row.section,
        remedy: row.remediation,
      })),
    },
    {
      id: 'methodology',
      title: 'Methodology and provenance',
      text: `Detector versions: ${JSON.stringify(input.detectorVersions)}. Searches: ${input.provenanceSearches.join('; ')}.`,
    },
    {
      id: 'limitations',
      title: 'Limitations',
      text: 'Repository evidence cannot establish notices, consents, contracts, or processing purposes. Unavailable detectors remain unknown.',
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer',
      text: base.disclaimer,
    },
  ];
  return {
    report: base.report,
    organization: base.organization,
    scan: base.scan,
    scoringVersion: base.scan.scoringVersion,
    sections,
    generatedAt: base.generatedAt,
  };
}
