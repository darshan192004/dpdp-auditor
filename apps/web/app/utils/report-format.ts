/** Pure strings the HTML report preview renders, matching the PDF template. */

export interface ReportFindingControl {
  code: string;
  section: string;
  title: string;
  severity: string;
  rationale: string | null;
}

/** A section with no applicable control is explicitly unassessed, not blank. */
export function formatSectionScore(score: number | null): string {
  return score === null ? 'Not assessed' : String(score);
}

/** Every finding is attributed to a control, or explicitly marked unmapped. */
export function formatFindingControl(control: ReportFindingControl | null): string {
  return control === null ? 'Unmapped — no DPDPA control' : `${control.code} — ${control.title}`;
}
