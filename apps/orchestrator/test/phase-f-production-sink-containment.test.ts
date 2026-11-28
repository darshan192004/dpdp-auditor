import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { requestLogFields } from '../src/common/logger.js';
import { toFindingView, type FindingWithRule } from '../src/modules/findings/findings.service.js';
import { buildReportViewModel } from '../src/modules/reports/report-view-model.js';
import { renderReportHtml } from '../src/modules/reports/report-template.js';
import { canonicalControlResultsBytes } from '../src/modules/scoring/control-results-canonical.js';
import { fixtureDirs, hostileSinkInputs, runFixture } from './helpers/phase-f-fixture.js';

/**
 * The Phase F sink gate must exercise the serializers production actually
 * uses, not only the allow-list projection in `redactedSinks`. The callback
 * sink is covered on the runner side by `tests/test_canary_containment.py`,
 * which captures the signed HTTP body emitted by `BatchClient`.
 */

function hostileFinding(marker: string): FindingWithRule {
  const finding = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    scanId: '88888888-8888-4888-8888-888888888888',
    orgId: '11111111-1111-4111-8111-111111111111',
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.python.canary',
    scannerRuleVersion: '1.95.0',
    dpdpaRuleId: null,
    controlCode: 'DPDPA-8.4-LOG-01',
    severity: 'critical',
    confidence: 'direct',
    filePath: 'services/payments/api/views.py',
    lineStart: 142,
    lineEnd: 149,
    columnStart: null,
    columnEnd: null,
    message: 'Personal data is written to application logs.',
    evidenceRedacted: 'logger.info("card=****4242")',
    evidenceHash: 'sha256:5f2c',
    fingerprint: 'fpt_1:DPDPA-8.4-LOG-01',
    status: 'open',
    isNew: true,
    firstSeenAt: new Date('2026-11-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-11-01T00:00:00.000Z'),
    context: { rationale: 'Logging personal data widens access.' },
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    dpdpaRule: null,
    rawSource: `${marker} source excerpt`,
    rawScannerOutput: `${marker} raw scanner output`,
    matchedValue: marker,
  };
  expect(finding.rawSource).toContain(marker);
  expect(finding.rawScannerOutput).toContain(marker);
  return finding as unknown as FindingWithRule;
}

function reportModel(finding: FindingWithRule) {
  const scan = {
    id: finding.scanId,
    orgId: finding.orgId,
    repositoryId: '55555555-5555-4555-8555-555555555555',
    repository: {
      id: '55555555-5555-4555-8555-555555555555',
      fullName: 'acme/payments-service',
      visibility: 'private',
    },
    ref: 'main',
    commitSha: 'a'.repeat(40),
    status: 'completed',
    score: { toString: () => '70.95' },
    grade: 'C',
    sectionScores: {},
    counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
    coverage: { semgrep: 'completed' },
    coverageStatus: 'full',
    scannerVersions: { semgrep: '1.95.0' },
    rulePackVersion: 'dpdpa-2026.10.6',
    scoringVersion: '1.0.0',
    facts: {},
    verdictCounts: {},
    unknownControls: [],
    gradeWithheldReason: null,
    queuedAt: new Date('2026-11-12T00:00:00.000Z'),
    startedAt: new Date('2026-11-12T00:00:01.000Z'),
    completedAt: new Date('2026-11-12T00:01:01.000Z'),
    durationMs: 60_000,
  };
  return buildReportViewModel({
    report: {
      id: '99999999-9999-4999-8999-999999999999',
      format: 'pdf',
      templateVersion: '2026.1',
      createdAt: new Date('2026-11-12T00:00:00.000Z'),
    } as never,
    scan: scan as never,
    organization: {
      id: finding.orgId,
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'ap-south-1',
      settings: {},
    } as never,
    findings: [finding],
  });
}

const FULL_CORPUS_TIMEOUT = 30_000;

describe('Phase F production sink containment', () => {
  it(
    'uses the real DB-row serializer and never emits hostile evidence fields',
    async () => {
      for (const dir of fixtureDirs()) {
        const run = await runFixture(dir);
        const hostile = hostileSinkInputs(dir, run);
        expect(hostile.markerPresentInHostileFields).toBe(true);
        expect(canonicalControlResultsBytes(hostile.input.controlResults)).not.toContain(
          hostile.marker,
        );
      }
    },
    FULL_CORPUS_TIMEOUT,
  );

  it('uses the real API, report and log serializers without the canary', async () => {
    const dir = fixtureDirs()[0]!;
    const run = await runFixture(dir);
    const marker = hostileSinkInputs(dir, run).marker;
    const finding = hostileFinding(marker);
    const viewModel = reportModel(finding);

    expect(JSON.stringify(toFindingView(finding))).not.toContain(marker);
    expect(JSON.stringify(viewModel)).not.toContain(marker);
    expect(renderReportHtml(viewModel as never)).not.toContain(marker);

    const request = {
      headers: { 'x-org-id': marker },
      params: { scanId: marker },
      routeOptions: { url: '/orgs/:orgId/scans/:scanId' },
    } as unknown as FastifyRequest;
    expect(JSON.stringify(requestLogFields(request, 200))).not.toContain(marker);
  });
});
