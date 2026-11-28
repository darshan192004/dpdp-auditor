import { exportedResults, type ExportInput } from './export.schemas.js';

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  properties: { section: string };
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'none';
  message: { text: string };
  properties: {
    section: string;
    verdict: string;
    reasonCode: string;
    evidenceHashes: string[];
  };
}

/** SARIF 2.1.0 built only from bounded hashes and verdict metadata. */
export function buildSarif(input: ExportInput) {
  const rows = exportedResults(input);
  const rules: SarifRule[] = rows.map((row) => ({
    id: row.controlCode,
    name: `Readiness ${row.controlCode}`,
    shortDescription: { text: `Section ${row.section} control ${row.controlCode}` },
    properties: { section: row.section },
  }));
  const results: SarifResult[] = rows.map((row) => ({
    ruleId: row.controlCode,
    level: row.verdict === 'UNKNOWN' ? 'none' : 'error',
    message: {
      text:
        row.verdict === 'UNKNOWN'
          ? 'Could not determine: no determinable code evidence or current attestation.'
          : `Readiness gap: ${row.reasonCode}.`,
    },
    properties: {
      section: row.section,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
      evidenceHashes: row.evidence
        .map((item) => item.evidenceHash)
        .filter((hash): hash is string => typeof hash === 'string'),
    },
  }));
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'DPDPA readiness',
            version: input.rulePackVersion ?? 'unknown',
            rules,
          },
        },
        results,
        properties: {
          scanId: input.scanId,
          repository: input.repository,
          scoringVersion: input.scoringVersion,
        },
      },
    ],
  };
}
