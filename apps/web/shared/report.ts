import type { FindingView } from './findings';
import type { ScanDetail } from './scan';

/** View model shared by the HTML report preview and the API/PDF renderer. */
export interface ReportViewModel {
  report: { id: string; format: string; templateVersion: string; createdAt: string };
  organization: { id?: string; name: string; slug: string; dataRegion: string };
  scan: Pick<
    ScanDetail,
    | 'id'
    | 'repository'
    | 'ref'
    | 'commitSha'
    | 'status'
    | 'score'
    | 'grade'
    | 'sectionScores'
    | 'counts'
    | 'coverage'
    | 'rulePackVersion'
    | 'scoringVersion'
    | 'timestamps'
  >;
  topFindings: Pick<FindingView, 'id' | 'message' | 'severity' | 'scanner' | 'dpdpa' | 'status'>[];
  methodology: { scoringVersion: string | null; rulePackVersion: string | null; summary: string };
  disclaimer: string;
  generatedAt: string;
}
