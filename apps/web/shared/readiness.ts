export interface ReadinessInventory {
  version: string | null;
  status: string | null;
  consentGatingRatio: number | null;
  signals: Array<{
    detector: string;
    kind: string;
    path: string;
    line: number | null;
    token: string;
    count?: number | null;
  }>;
}

export interface ReadinessGap {
  controlCode: string;
  section: string;
  title: string;
  verdict: 'FAIL' | 'PARTIAL' | 'ATTESTED_FAIL';
  reasonCode: string;
  evidence: unknown[];
}

export interface FixPlan {
  steps: Array<{
    controlCode: string;
    section: string;
    title: string;
    remedy: string;
  }>;
}
