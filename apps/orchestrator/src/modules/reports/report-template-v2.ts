import type { buildReportV2ViewModel } from './report-view-model-v2.js';

type V2Model = ReturnType<typeof buildReportV2ViewModel>;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rows(model: V2Model, id: string): string {
  const section = model.sections.find((candidate) => candidate.id === id);
  if (section?.rows === undefined || section.rows.length === 0) {
    return '<p>No recorded entries.</p>';
  }
  return `<table><thead><tr><th>Control</th><th>Section</th><th>Verdict</th><th>Detail</th></tr></thead><tbody>${section.rows
    .map(
      (row) =>
        `<tr><td>${esc(row.controlCode)}</td><td>${esc(row.section)}</td><td>${esc(row.verdict)}</td><td>${esc(row.reasonCode ?? row.remedy)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

/** Readiness-only HTML; source values never enter the document. */
export function renderReportV2Html(model: V2Model): string {
  const sections = model.sections
    .map((section) => {
      if (section.id === 'gaps_by_section') {
        const groups = (section.groups ?? [])
          .map(
            (group) =>
              `<h3>Section ${esc(group.section)}</h3><ul>${group.rows
                .map((row) => `<li>${esc(row.controlCode)} — ${esc(row.verdict)}</li>`)
                .join('')}</ul>`,
          )
          .join('');
        return `<section id="${section.id}"><h2>${esc(section.title)}</h2>${groups || '<p>No recorded gaps.</p>'}</section>`;
      }
      if (section.id === 'executive_summary') {
        const table = (section.table ?? [])
          .map(
            (entry) =>
              `<tr><td>${esc(entry.provision)}</td><td>${esc(entry.effectiveFrom)}</td><td>${esc(entry.sourceUrl)}</td><td>${esc(entry.verifiedOn)}</td></tr>`,
          )
          .join('');
        return `<section id="${section.id}"><h2>${esc(section.title)}</h2>${rows(model, section.id)}<table><thead><tr><th>Provision</th><th>Effective</th><th>Source</th><th>Verified</th></tr></thead><tbody>${table}</tbody></table></section>`;
      }
      return `<section id="${section.id}"><h2>${esc(section.title)}</h2>${rows(model, section.id)}<p>${esc(section.text ?? '')}</p></section>`;
    })
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Readiness report ${esc(model.report.id)}</title><style>body{font-family:sans-serif;max-width:52rem;margin:2rem auto;color:#16181d}h2{margin-top:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8dbe2;padding:.4rem;text-align:left}</style></head><body><h1>Readiness report</h1><p>Repository ${esc(model.scan.repository.fullName)} · ref ${esc(model.scan.ref)} · scoring ${esc(model.scan.scoringVersion)}</p>${sections}</body></html>`;
}
