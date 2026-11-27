/** Bounded detector metadata; never carries source values or snippets. */
export interface DetectorControlExplanation {
  code: string;
  evidenceMode: string;
  absenceTokens: string[];
}

export interface DetectorExplanation {
  id: string;
  module: string;
  inputs: string[];
  outputs: string[];
  timeoutMs: number;
  confidence: string;
  failureMode: string;
  controls: DetectorControlExplanation[];
}

export interface DetectorCatalog {
  pack: string;
  detectors: DetectorExplanation[];
}
