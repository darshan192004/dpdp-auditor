/**
 * P5-18: PDF template v1 (docs/design.md report section, docs/api.md 10.6).
 *
 * Pure HTML string builder over the shared report view model - the same
 * payload the HTML preview route renders, so the PDF and the screen agree.
 * Sections: cover, executive summary, score breakdown, top findings,
 * remediation, methodology, appendix. Never emits source code or secrets:
 * findings carry only the redacted evidence the scanner produced.
 */

export interface ReportTemplateFinding {
  id: string;
  severity: string;
  scanner: string;
  message: string;
  filePath: string;
  lineStart: number;
  dpdpa: { code: string; section: string; title: string; rationale: string | null } | null;
  remediation: { summary: string; steps: string[] } | null;
}

export interface ReportTemplateModel {
  report: { id: string; format: string; templateVersion: string; createdAt: Date | string };
  organization: {
    name: string;
    slug: string;
    dataRegion: string;
    branding: { logoUrl: string | null; primaryColor: string | null; footerText: string | null };
  };
  scan: {
    id: string;
    repository: { fullName: string; visibility: string };
    ref: string;
    commitSha: string | null;
    status: string;
    score: number | null;
    grade: string | null;
    sectionScores: Record<string, number | null>;
    counts: Record<'critical' | 'high' | 'medium' | 'low' | 'info' | 'total', number>;
    coverage: Record<string, string>;
    coverageStatus: string;
    rulePackVersion: string | null;
    scoringVersion: string | null;
    timestamps: {
      queuedAt: Date | string;
      startedAt: Date | string | null;
      completedAt: Date | string | null;
      durationMs: number | null;
    };
  };
  topFindings: ReportTemplateFinding[];
  methodology: { scoringVersion: string | null; rulePackVersion: string | null; summary: string };
  disclaimer: string;
  generatedAt: Date | string;
}

const SECTION_LABELS: Record<string, string> = {
  '5': 'Notice',
  '6': 'Consent',
  '7': 'Legitimate uses',
  '8(4)': 'Security safeguards',
  '8(5)': 'Breach notification',
  '9': "Children's data",
  '10': 'SDF obligations',
  '12': 'Right to access',
  '13': 'Correction and erasure',
  '16': 'Cross-border transfer',
};

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

/** Section score -> readiness evidence wording (never a compliance verdict). */
function sectionStatus(score: number | null): string {
  if (score === null) return 'not assessed';
  if (score >= 90) return 'Evidence of a safeguard';
  if (score >= 75) return 'Partial evidence';
  return 'Evidence of a gap';
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iso(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function score(value: number | null): string {
  return value === null ? 'Not assessed' : value.toFixed(1);
}

function duration(ms: number | null): string {
  if (ms === null) return '-';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function shortSha(sha: string | null): string {
  return sha === null ? '-' : sha.slice(0, 7);
}

function sectionsRows(model: ReportTemplateModel): string {
  return Object.entries(model.scan.sectionScores)
    .map(([code, value]) => ({ code, value }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.code.localeCompare(b.code);
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return a.value - b.value;
    })
    .map(
      ({ code, value }) => `
      <tr>
        <td><span class="muted">${esc(code)}</span> ${esc(SECTION_LABELS[code] ?? code)}</td>
        <td class="num">${score(value)}</td>
        <td>${esc(sectionStatus(value))}</td>
      </tr>`,
    )
    .join('');
}

function severityRows(model: ReportTemplateModel): string {
  return SEVERITIES.map(
    (severity) => `
      <tr>
        <td class="cap">${esc(severity)}</td>
        <td class="num">${model.scan.counts[severity] ?? 0}</td>
      </tr>`,
  ).join('');
}

function findingRows(model: ReportTemplateModel): string {
  if (model.topFindings.length === 0) {
    return '<tr><td colspan="4" class="muted">No open findings were recorded for this scan.</td></tr>';
  }
  return model.topFindings
    .map(
      (finding) => `
      <tr>
        <td>
          ${esc(finding.message)}
          <br /><span class="muted">${esc(finding.filePath)}:${finding.lineStart}</span>
        </td>
        <td class="cap">${esc(finding.severity)}</td>
        <td>${esc(finding.dpdpa ? `${finding.dpdpa.section} ${finding.dpdpa.title}` : 'Unmapped — no DPDPA control')}</td>
        <td>${esc(finding.scanner)}</td>
      </tr>`,
    )
    .join('');
}

function remediationItems(model: ReportTemplateModel): string {
  const actionable = model.topFindings.filter((finding) => finding.remediation !== null);
  if (actionable.length === 0) {
    return '<p class="muted">No remediation steps were attached to the findings in this scan.</p>';
  }
  return actionable
    .slice(0, 20)
    .map((finding) => {
      const steps = (finding.remediation?.steps ?? [])
        .map((step) => `<li>${esc(step)}</li>`)
        .join('');
      return `
      <div class="finding">
        <h3><span class="cap">${esc(finding.severity)}</span> ${esc(finding.remediation?.summary ?? finding.message)}</h3>
        <p class="muted">${esc(finding.dpdpa ? `Control ${finding.dpdpa.code}: ${finding.dpdpa.title}` : `Unmapped finding from ${finding.scanner}`)}</p>
        <ol>${steps}</ol>
      </div>`;
    })
    .join('');
}

/** Template v1: seven sections, A4 print CSS, no JavaScript. */
export function renderReportHtml(model: ReportTemplateModel): string {
  const primary = model.organization.branding.primaryColor ?? '#0f7b4f';
  const footer =
    model.organization.branding.footerText ??
    `${model.organization.name} - DPDPA audit report ${model.report.id}`;
  const grade = model.scan.grade ?? 'withheld';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(model.organization.name)} - DPDPA audit report</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #16181d; font-size: 10.5pt; line-height: 1.55; margin: 0; }
  h1, h2, h3 { font-family: Helvetica, Arial, sans-serif; line-height: 1.25; }
  h1 { font-size: 26pt; margin: 0 0 6pt; }
  h2 { font-size: 15pt; border-bottom: 1px solid #d8dbe2; padding-bottom: 4pt; margin: 26pt 0 10pt; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14pt 0 4pt; page-break-after: avoid; }
  p { margin: 6pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; font-size: 9.5pt; page-break-inside: avoid; }
  th { text-align: left; font-family: Helvetica, Arial, sans-serif; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #5b616e; border-bottom: 1px solid #d8dbe2; padding: 5pt 6pt; }
  td { border-bottom: 1px solid #eceef2; padding: 5pt 6pt; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cap { text-transform: capitalize; }
  .muted { color: #5b616e; font-size: 9pt; }
  .accent { color: ${esc(primary)}; }
  .cover { page-break-after: always; padding-top: 60mm; }
  .cover .rule { width: 64pt; height: 4pt; background: ${esc(primary)}; margin: 18pt 0; }
  .kpis { display: flex; gap: 28pt; margin: 14pt 0; }
  .kpi .label { font-family: Helvetica, Arial, sans-serif; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #5b616e; }
  .kpi .value { font-family: Helvetica, Arial, sans-serif; font-size: 24pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt 16pt; font-size: 9.5pt; }
  .meta .label { font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #5b616e; }
  .finding { page-break-inside: avoid; margin: 10pt 0; }
  .finding ol { margin: 4pt 0 0 16pt; padding: 0; }
  .disclaimer { border-top: 1px solid #d8dbe2; margin-top: 24pt; padding-top: 8pt; font-size: 8.5pt; color: #5b616e; }
  .footer { position: fixed; bottom: 0; font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #8b919e; }
</style>
</head>
<body>
  <div class="footer">${esc(footer)}</div>

  <!-- 1. Cover -->
  <section class="cover">
    <p class="muted">DPDPA audit report</p>
    <div class="rule"></div>
    <h1>${esc(model.scan.repository.fullName)}</h1>
    <p>${esc(model.organization.name)} &middot; ${esc(model.scan.ref)} @ ${esc(shortSha(model.scan.commitSha))}</p>
    <p class="muted">Generated ${esc(iso(model.generatedAt))} &middot; report ${esc(model.report.id)} &middot; template ${esc(model.report.templateVersion)}</p>
  </section>

  <!-- 2. Executive summary -->
  <section>
    <h2>Executive summary</h2>
    <div class="kpis">
      <div class="kpi"><div class="label">Score</div><div class="value">${score(model.scan.score)}</div></div>
      <div class="kpi"><div class="label">Grade</div><div class="value">${esc(grade)}</div></div>
      <div class="kpi"><div class="label">Findings</div><div class="value">${model.scan.counts.total}</div></div>
      <div class="kpi"><div class="label">Coverage</div><div class="value">${esc(model.scan.coverageStatus)}</div></div>
    </div>
    <div class="meta">
      <div><div class="label">Status</div><div>${esc(model.scan.status)}</div></div>
      <div><div class="label">Completed</div><div>${esc(iso(model.scan.timestamps.completedAt))}</div></div>
      <div><div class="label">Duration</div><div>${esc(duration(model.scan.timestamps.durationMs))}</div></div>
      <div><div class="label">Visibility</div><div>${esc(model.scan.repository.visibility)}</div></div>
    </div>
    <table>
      <caption class="muted">Findings by severity</caption>
      <thead><tr><th>Severity</th><th class="num">Count</th></tr></thead>
      <tbody>${severityRows(model)}</tbody>
    </table>
  </section>

  <!-- 3. Score breakdown -->
  <section>
    <h2>Score breakdown</h2>
    <table>
      <thead><tr><th>Section</th><th class="num">Score</th><th>Status</th></tr></thead>
      <tbody>${sectionsRows(model)}</tbody>
    </table>
  </section>

  <!-- 4. Top findings -->
  <section>
    <h2>Top findings</h2>
    <table>
      <thead><tr><th>Finding</th><th>Severity</th><th>Control</th><th>Scanner</th></tr></thead>
      <tbody>${findingRows(model)}</tbody>
    </table>
  </section>

  <!-- 5. Remediation -->
  <section>
    <h2>Remediation</h2>
    ${remediationItems(model)}
  </section>

  <!-- 6. Methodology -->
  <section>
    <h2>Methodology</h2>
    <p>${esc(model.methodology.summary)}</p>
    <p class="muted">Rule pack ${esc(model.methodology.rulePackVersion ?? '-')} &middot; scoring version ${esc(model.methodology.scoringVersion ?? '-')} &middot; format ${esc(model.report.format)}</p>
  </section>

  <!-- 7. Appendix -->
  <section>
    <h2>Appendix</h2>
    <div class="meta">
      <div><div class="label">Organisation</div><div>${esc(model.organization.name)}</div></div>
      <div><div class="label">Data region</div><div>${esc(model.organization.dataRegion)}</div></div>
      <div><div class="label">Scan</div><div>${esc(model.scan.id)}</div></div>
      <div><div class="label">Report</div><div>${esc(model.report.id)}</div></div>
    </div>
    <p class="muted">Scanner coverage: ${esc(
      Object.entries(model.scan.coverage)
        .map(([name, value]) => `${name} ${value}`)
        .join(', ') || 'not recorded',
    )}</p>
    <p class="disclaimer">${esc(model.disclaimer)}</p>
  </section>
</body>
</html>`;
}
