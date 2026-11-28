import type { DetectorStatus } from './control-evaluator.js';

export interface CoverageBanner {
  detector: string;
  status: DetectorStatus;
  reasonCode: 'detector_unavailable';
  controlCodes: string[];
  message: string;
}

/** Readiness-only banner naming every detector that could not complete. */
export function buildCoverageBanners(
  detectorStatuses: Readonly<Record<string, DetectorStatus>>,
  unknownControls: readonly string[],
): CoverageBanner[] {
  const controls = [...unknownControls].sort();
  return Object.entries(detectorStatuses)
    .filter(([, status]) => status !== 'completed')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([detector, status]) => ({
      detector,
      status,
      reasonCode: 'detector_unavailable' as const,
      controlCodes: controls,
      message: `Could not determine from code: ${detector} ${status}.`,
    }));
}
