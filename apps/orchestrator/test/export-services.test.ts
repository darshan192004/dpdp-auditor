import { describe, expect, it } from 'vitest';
import { buildIssueMarkdown } from '../src/modules/exports/markdown.service.js';
import { buildSarif } from '../src/modules/exports/sarif.service.js';

const input = {
  scanId: 'scn_1',
  repository: 'acme/repo',
  rulePackVersion: 'dpdpa-2026.11.0',
  scoringVersion: 'scoring-2.0.0',
  results: [
    {
      controlCode: 'DPDPA-8.4-SECRET-01',
      section: '8(4)',
      verdict: 'FAIL',
      reasonCode: 'cited_gap',
      remediation: 'Use a managed credential store.',
      evidence: [
        {
          kind: 'violation',
          scanner: 'gitleaks',
          evidenceHash: 'sha256:code-only',
        },
      ],
    },
    {
      controlCode: 'DPDPA-9-CHILD-01',
      section: '9',
      verdict: 'UNKNOWN',
      reasonCode: 'detector_unavailable',
      remediation: 'Add a detector.',
      evidence: [],
    },
    {
      controlCode: 'DPDPA-6-CONSENT-01',
      section: '6',
      verdict: 'ATTESTED_PASS',
      reasonCode: 'attested_pass',
      remediation: 'None.',
      evidence: [],
    },
  ],
};

describe('readiness exports', () => {
  it('builds SARIF 2.1.0 from non-passing results only', () => {
    const sarif = buildSarif(input);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    const run = sarif.runs[0]!;
    expect(run.tool.driver.name).toBe('DPDPA readiness');
    expect(run.tool.driver.rules?.map((rule) => rule.id)).toEqual([
      'DPDPA-8.4-SECRET-01',
      'DPDPA-9-CHILD-01',
    ]);
    expect(run.results?.map((result) => result.level)).toEqual(['error', 'none']);
    expect(run.results?.[0]?.properties).toMatchObject({
      section: '8(4)',
      verdict: 'FAIL',
      evidenceHashes: ['sha256:code-only'],
    });
    expect(JSON.stringify(sarif)).not.toContain('CANARY_SOURCE_VALUE');
    expect(JSON.stringify(sarif)).not.toContain('attested_pass');
  });

  it('builds issue-ready Markdown without issue-creation instructions', () => {
    const markdown = buildIssueMarkdown(input);
    expect(markdown).toContain('# Readiness gaps — acme/repo');
    expect(markdown).toContain('## Section 8(4)');
    expect(markdown).toContain('DPDPA-8.4-SECRET-01');
    expect(markdown).toContain('sha256:code-only');
    expect(markdown).toContain('Could not determine');
    expect(markdown).not.toContain('api.github.com');
    expect(markdown).not.toContain('/issues');
  });
});
