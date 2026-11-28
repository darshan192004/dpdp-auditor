import { exportedResults, type ExportInput, type ExportResult } from './export.schemas.js';

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Draft for a human to copy; this module never opens an issue or PR. */
export function buildIssueMarkdown(input: ExportInput): string {
  const rows = exportedResults(input);
  const sections = new Map<string, ExportResult[]>();
  for (const row of rows) {
    const items = sections.get(row.section) ?? [];
    items.push(row);
    sections.set(row.section, items);
  }
  const lines = [
    `# Readiness gaps — ${input.repository}`,
    '',
    `Scan ${input.scanId} · rule pack ${input.rulePackVersion ?? 'unknown'} · scoring ${input.scoringVersion ?? 'unknown'}`,
    '',
    'This file is an issue-ready draft. Review it before creating any issue; nothing is opened automatically.',
    '',
  ];
  for (const [section, items] of [...sections.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## Section ${section}`, '');
    for (const row of items) {
      lines.push(`### ${row.controlCode} — ${row.verdict}`, '');
      lines.push(`Reason: ${escapeCell(row.reasonCode)}`, '');
      const hashes = row.evidence
        .map((item) => item.evidenceHash)
        .filter((hash): hash is string => typeof hash === 'string');
      lines.push(`Evidence hashes: ${hashes.length > 0 ? hashes.join(', ') : 'none'}`, '');
      lines.push(`Suggested fix: ${escapeCell(row.remediation)}`, '');
      if (row.verdict === 'UNKNOWN')
        lines.push('Could not determine; add a detector or current attestation.', '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
