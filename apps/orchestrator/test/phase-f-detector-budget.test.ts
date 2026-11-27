import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateControls, type EvidenceLike } from '../src/modules/scoring/control-evaluator.js';
import { buildCoverageBanners } from '../src/modules/scoring/coverage-banners.js';
import {
  buildReportViewModel,
  type ReportSource,
} from '../src/modules/reports/report-view-model.js';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';

const packDir = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));
const CODE = 'DPDPA-8.4-SECRET-01';
type Status = 'completed' | 'failed' | 'timed_out' | 'skipped';

function finding(overrides: Partial<EvidenceLike> = {}): EvidenceLike {
  return {
    controlCode: CODE,
    kind: 'violation',
    scanner: 'gitleaks',
    scannerRuleId: 'generic-api-key',
    evidenceHash: 'sha256:' + 'a'.repeat(64),
    fingerprint: 'fixture:phase-f:secret',
    severity: 'critical',
    confidence: 'direct',
    status: 'open',
    ...overrides,
  };
}

async function evaluate(statuses: Record<string, Status>, findings: EvidenceLike[]) {
  const pack = await loadRulePack(packDir);
  return evaluateControls({
    controls: pack.controls.filter((control) => control.code === CODE),
    facts: { languages: ['java'] },
    mappings: pack.mappings,
    detectorStatuses: statuses,
    findings,
    rulePackVersion: pack.pack,
    scoringVersion: 'scoring-2.0.0',
  });
}

const allCompleted: Record<string, Status> = {
  semgrep: 'completed',
  checkov: 'completed',
  gitleaks: 'completed',
};

describe('Phase F detector error budget', () => {
  it('turns a detector timeout into UNKNOWN with detector_unavailable', async () => {
    const evaluation = await evaluate({ ...allCompleted, gitleaks: 'timed_out' }, []);
    const result = evaluation.results[0]!;
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCode).toBe('detector_unavailable');
    expect(evaluation.unknownControls).toContain(CODE);
  });

  it('keeps a direct finding from a completed detector as FAIL during another detector crash', async () => {
    const evaluation = await evaluate({ ...allCompleted, gitleaks: 'failed' }, [
      finding({ scanner: 'semgrep', scannerRuleId: 'dpdpa.secret' }),
    ]);
    const result = evaluation.results[0]!;
    expect(result.verdict).toBe('FAIL');
    expect(result.evidence[0]?.fingerprint).toBe('fixture:phase-f:secret');
  });

  it('never reuses a previous PASS when a required detector later fails', async () => {
    const before = await evaluate(allCompleted, [
      finding({ kind: 'positive', scanner: 'semgrep', confidence: 'direct' }),
    ]);
    expect(before.results[0]?.verdict).toBe('PASS');

    const after = await evaluate({ ...allCompleted, gitleaks: 'failed' }, []);
    expect(after.results[0]?.verdict).toBe('UNKNOWN');
    expect(after.results[0]?.verdict).not.toBe('PASS');
  });

  it('produces a named coverage banner for each non-completed detector', () => {
    expect(buildCoverageBanners({ gitleaks: 'timed_out', semgrep: 'completed' }, [CODE])).toEqual([
      {
        detector: 'gitleaks',
        status: 'timed_out',
        reasonCode: 'detector_unavailable',
        controlCodes: [CODE],
        message: 'Could not determine from code: gitleaks timed_out.',
      },
    ]);
    expect(buildCoverageBanners(allCompleted, [CODE])).toEqual([]);
  });

  it('puts the named banners in the report view model', () => {
    const source = {
      report: {
        id: 'rpt-phase-f',
        format: 'PDF',
        templateVersion: 'v1',
        createdAt: new Date('2026-11-27T00:00:00Z'),
      },
      scan: {
        id: 'scn-phase-f',
        repository: { id: 'repo-1', fullName: 'acme/repo', visibility: 'PUBLIC' },
        ref: 'main',
        commitSha: null,
        status: 'completed',
        score: null,
        grade: null,
        sectionScores: {},
        counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        coverage: { gitleaks: 'timed_out' },
        coverageStatus: 'partial',
        scannerVersions: {},
        rulePackVersion: 'dpdpa-2026.10.6',
        scoringVersion: 'scoring-2.0.0',
        unknownControls: [CODE],
        queuedAt: new Date('2026-11-27T00:00:00Z'),
        startedAt: new Date('2026-11-27T00:00:10Z'),
        completedAt: new Date('2026-11-27T00:01:00Z'),
        durationMs: 50_000,
      },
      organization: {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        dataRegion: 'IN',
        settings: {},
      },
      findings: [],
    } as unknown as ReportSource;

    expect(buildReportViewModel(source).coverageBanners).toEqual([
      {
        detector: 'gitleaks',
        status: 'timed_out',
        reasonCode: 'detector_unavailable',
        controlCodes: [CODE],
        message: 'Could not determine from code: gitleaks timed_out.',
      },
    ]);
  });
});
