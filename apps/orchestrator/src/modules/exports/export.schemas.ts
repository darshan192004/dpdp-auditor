export interface ExportEvidence {
  kind?: string;
  scanner?: string;
  evidenceHash?: string;
}

export interface ExportResult {
  controlCode: string;
  section: string;
  verdict: string;
  reasonCode: string;
  remediation: string;
  evidence: readonly ExportEvidence[];
}

export interface ExportInput {
  scanId: string;
  repository: string;
  rulePackVersion: string | null;
  scoringVersion: string | null;
  results: readonly ExportResult[];
}

export const EXPORT_LIMIT = 500;

/** Pass and attested-pass results never appear in a gap export. */
export function exportedResults(input: ExportInput): readonly ExportResult[] {
  return input.results
    .filter((row) => row.verdict !== 'PASS' && row.verdict !== 'ATTESTED_PASS')
    .slice(0, EXPORT_LIMIT);
}
