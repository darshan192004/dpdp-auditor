import { isScoringV2 } from '../scoring/scoring.engine.js';
import { renderReportPdf } from './report-pdf.js';
import { renderReportV2Pdf } from './report-pdf-v2.js';
import { renderReportHtml, type ReportTemplateModel } from './report-template.js';
import { renderReportV2Html } from './report-template-v2.js';
import type { buildReportV2ViewModel } from './report-view-model-v2.js';

type V2Model = ReturnType<typeof buildReportV2ViewModel>;

export function renderHtmlForModel(model: ReportTemplateModel | V2Model): string {
  return isScoringV2(model.scan?.scoringVersion)
    ? renderReportV2Html(model as V2Model)
    : renderReportHtml(model as ReportTemplateModel);
}

export type BrowserPdfRenderer = (
  html: string,
  browserWSEndpoint: string | undefined,
) => Promise<Buffer>;

export function renderPdfForModel(
  model: ReportTemplateModel | V2Model,
  browserWSEndpoint: string | undefined,
  renderBrowserPdf: BrowserPdfRenderer,
): Promise<Buffer> {
  if (isScoringV2(model.scan?.scoringVersion)) return renderReportV2Pdf(model as V2Model);
  return browserWSEndpoint !== undefined
    ? renderBrowserPdf(renderReportHtml(model as ReportTemplateModel), browserWSEndpoint)
    : renderReportPdf(model as ReportTemplateModel);
}
