import { describe, expect, it } from 'vitest';

import {
  canManageScans,
  createIdempotencyKey,
  isTerminalStatus,
  nextPollDelayMs,
  quotaExhausted,
  scanCancelPath,
  scanElapsedMs,
  scanEventDetail,
  scanEventLabel,
  scanEventsPath,
  scanSubmitPath,
  scannerFailureNote,
  scannerProgress,
  scanStages,
  validateScanCancel,
  validateScanSubmit,
  ScanInputError,
} from '../shared/scan';
import {
  FIXTURE_PARTIAL_SCAN_ID,
  FIXTURE_RUNNING_SCAN_ID,
  FIXTURE_SCANS,
  getFixtureScan,
  getFixtureScanEvents,
} from '../server/utils/fixtures/scans';
import { FIXTURE_SCAN_ID, FixtureNotFoundError } from '../server/utils/fixtures/findings';

describe('isTerminalStatus (docs/design.md §7.3)', () => {
  it('stops polling for every terminal state', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'expired'] as const) {
      expect(isTerminalStatus(status)).toBe(true);
    }
  });

  it('keeps polling while the scan is active', () => {
    for (const status of ['queued', 'cloning', 'scanning', 'mapping'] as const) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });
});

describe('scanStages (docs/design.md §5.6)', () => {
  const states = (status: Parameters<typeof scanStages>[0], options?: { started?: boolean }) =>
    scanStages(status, options).map((stage) => stage.state);

  it('walks the five stages in order', () => {
    expect(scanStages('queued').map((stage) => stage.stage)).toEqual([
      'queued',
      'cloning',
      'scanning',
      'mapping',
      'completed',
    ]);
  });

  it('marks completed stages as done and the active one as current', () => {
    expect(states('queued')).toEqual(['current', 'pending', 'pending', 'pending', 'pending']);
    expect(states('scanning')).toEqual(['done', 'done', 'current', 'pending', 'pending']);
    expect(states('mapping')).toEqual(['done', 'done', 'done', 'current', 'pending']);
  });

  it('shows completed only when every stage is done', () => {
    expect(states('completed')).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('marks the stage that failed and leaves later stages pending', () => {
    expect(states('failed', { started: true })).toEqual([
      'done',
      'done',
      'failed',
      'pending',
      'pending',
    ]);
    expect(states('cancelled')).toEqual(['failed', 'pending', 'pending', 'pending', 'pending']);
    expect(states('expired', { started: true })).toEqual([
      'done',
      'done',
      'failed',
      'pending',
      'pending',
    ]);
  });
});

describe('scannerProgress (docs/design.md §5.6)', () => {
  it('lists every scanner in catalog order, treating a missing key as pending', () => {
    expect(scannerProgress({ semgrep: 'completed', checkov: 'running' })).toEqual([
      { scanner: 'semgrep', label: 'Semgrep', status: 'completed', statusLabel: 'Completed' },
      { scanner: 'checkov', label: 'Checkov', status: 'running', statusLabel: 'Running' },
      { scanner: 'gitleaks', label: 'Gitleaks', status: 'pending', statusLabel: 'Pending' },
    ]);
  });

  it('uses the scan vocabulary for failure states', () => {
    const rows = scannerProgress({
      semgrep: 'failed',
      checkov: 'timed_out',
      gitleaks: 'skipped',
    });

    expect(rows.map((row) => row.statusLabel)).toEqual(['Failed', 'Timed out', 'Skipped']);
  });
});

describe('scannerFailureNote (docs/design.md §5.6)', () => {
  it('warns as soon as a scanner fails, without waiting for the scan to finish', () => {
    expect(
      scannerFailureNote({ semgrep: 'completed', checkov: 'failed', gitleaks: 'pending' }),
    ).toBe('Coverage will be partial: Checkov failed.');
  });

  it('names every failed scanner', () => {
    expect(
      scannerFailureNote({ semgrep: 'failed', checkov: 'completed', gitleaks: 'timed_out' }),
    ).toBe('Coverage will be partial: Semgrep failed, Gitleaks timed out.');
  });

  it('stays quiet while scanners are merely pending or running', () => {
    expect(scannerFailureNote({ semgrep: 'completed', checkov: 'running' })).toBeNull();
    expect(scannerFailureNote({})).toBeNull();
  });
});

describe('scanElapsedMs', () => {
  it('measures a finished scan from start to completion', () => {
    expect(
      scanElapsedMs(
        {
          queuedAt: '2026-11-04T09:31:22.481Z',
          startedAt: '2026-11-04T09:31:49.112Z',
          completedAt: '2026-11-04T09:37:04.903Z',
        },
        Date.parse('2026-11-04T10:00:00.000Z'),
      ),
    ).toBe(315_791);
  });

  it('uses the queue time until the scan starts and never goes negative', () => {
    const timestamps = {
      queuedAt: '2026-11-04T09:31:22.481Z',
      startedAt: null,
      completedAt: null,
    };

    expect(scanElapsedMs(timestamps, Date.parse('2026-11-04T09:31:32.481Z'))).toBe(10_000);
    expect(scanElapsedMs(timestamps, Date.parse('2026-11-04T09:00:00.000Z'))).toBe(0);
  });
});

describe('nextPollDelayMs (docs/design.md §7.3)', () => {
  it('polls every two seconds, backing off to ten', () => {
    expect(nextPollDelayMs({ failures: 0, visible: true, terminal: false })).toBe(2_000);
    expect(nextPollDelayMs({ failures: 1, visible: true, terminal: false })).toBe(4_000);
    expect(nextPollDelayMs({ failures: 2, visible: true, terminal: false })).toBe(8_000);
    expect(nextPollDelayMs({ failures: 3, visible: true, terminal: false })).toBe(10_000);
    expect(nextPollDelayMs({ failures: 10, visible: true, terminal: false })).toBe(10_000);
  });

  it('does not poll when paused or finished', () => {
    expect(nextPollDelayMs({ failures: 0, visible: false, terminal: false })).toBeNull();
    expect(nextPollDelayMs({ failures: 0, visible: true, terminal: true })).toBeNull();
  });

  it('treats a negative failure count as zero', () => {
    expect(nextPollDelayMs({ failures: -3, visible: true, terminal: false })).toBe(2_000);
  });
});

describe('scan event view model (docs/api.md §3.5)', () => {
  const event = (type: string, payload: unknown) => ({
    type,
    at: '2026-11-04T09:31:22.481Z',
    payload,
  });

  it('labels known events and humanises unknown ones', () => {
    expect(scanEventLabel('queued')).toBe('Queued');
    expect(scanEventLabel('scanner_timed_out')).toBe('Scanner timed out');
    expect(scanEventLabel('custom_thing')).toBe('Custom thing');
  });

  it('summarises scanner and score payloads', () => {
    expect(scanEventDetail(event('scanner_completed', { scanner: 'semgrep', findings: 22 }))).toBe(
      'Semgrep · 22 findings',
    );
    expect(scanEventDetail(event('scanner_completed', { scanner: 'gitleaks', findings: 1 }))).toBe(
      'Gitleaks · 1 finding',
    );
    expect(scanEventDetail(event('scanner_timed_out', { scanner: 'gitleaks' }))).toBe('Gitleaks');
    expect(scanEventDetail(event('score_computed', { score: 72.44, grade: 'C' }))).toBe(
      'Score 72.4 · grade C',
    );
    expect(scanEventDetail(event('completed', { score: 72.4 }))).toBe('Score 72.4');
  });

  it('summarises the other lifecycle payloads', () => {
    expect(scanEventDetail(event('cancelled', { reason: 'Superseded by a newer commit' }))).toBe(
      'Superseded by a newer commit',
    );
    expect(scanEventDetail(event('cancelled', { reason: null }))).toBeNull();
    expect(
      scanEventDetail(event('failed', { code: 'CLONE_FAILED', message: 'Could not clone.' })),
    ).toBe('Could not clone.');
    expect(scanEventDetail(event('failed', { code: 'CLONE_FAILED' }))).toBe('CLONE_FAILED');
    expect(scanEventDetail(event('job_created', { jobName: 'scan-01j8z4a1' }))).toBe(
      'scan-01j8z4a1',
    );
    expect(scanEventDetail(event('clone_completed', { durationMs: 41_800 }))).toBe(
      'Finished in 42s',
    );
    expect(
      scanEventDetail(event('findings_batch', { scanner: 'semgrep', accepted: 20, duplicates: 2 })),
    ).toBe('Semgrep · 20 accepted, 2 duplicates');
    expect(
      scanEventDetail(event('queued', { ref: 'main', profile: 'standard', repository: 'acme/x' })),
    ).toBe('main · standard');
  });

  it('has no detail for empty or unknown payloads', () => {
    expect(scanEventDetail(event('queued', {}))).toBeNull();
    expect(scanEventDetail(event('mystery', { anything: true }))).toBeNull();
  });
});

describe('scan route paths', () => {
  it('builds the public events and cancel paths', () => {
    expect(scanEventsPath('scn_1')).toBe('/api/v1/scan/scn_1/events');
    expect(scanCancelPath('scn_1')).toBe('/api/v1/scan/scn_1/cancel');
  });

  it('encodes the scan id', () => {
    expect(scanEventsPath('a b')).toBe('/api/v1/scan/a%20b/events');
  });
});

describe('canManageScans (docs/api.md §1.3)', () => {
  it('allows auditors and above and rejects viewers', () => {
    expect(canManageScans('owner')).toBe(true);
    expect(canManageScans('admin')).toBe(true);
    expect(canManageScans('auditor')).toBe(true);
    expect(canManageScans('viewer')).toBe(false);
    expect(canManageScans(null)).toBe(false);
  });
});

describe('validateScanSubmit (docs/design.md §5.5)', () => {
  it('accepts a saved repository with a ref and profile', () => {
    expect(
      validateScanSubmit({ repositoryId: ' repo_1 ', ref: ' main ', profile: 'secrets-only' }),
    ).toEqual({ repositoryId: 'repo_1', ref: 'main', profile: 'secrets-only' });
  });

  it('accepts a pasted GitHub URL and defaults to the standard profile', () => {
    expect(validateScanSubmit({ githubUrl: 'https://github.com/acme/payments-service' })).toEqual({
      githubUrl: 'https://github.com/acme/payments-service',
      profile: 'standard',
    });
  });

  it('omits an empty ref so the server uses the default branch', () => {
    expect(validateScanSubmit({ repositoryId: 'repo_1', ref: '   ' })).toEqual({
      repositoryId: 'repo_1',
      profile: 'standard',
    });
  });

  it('requires exactly one repository source', () => {
    expect(() =>
      validateScanSubmit({ repositoryId: 'repo_1', githubUrl: 'https://github.com/acme/x' }),
    ).toThrow(ScanInputError);
    expect(() => validateScanSubmit({})).toThrow(ScanInputError);
  });

  it('reports the failing field', () => {
    const path = (body: unknown) => {
      try {
        validateScanSubmit(body);
      } catch (error) {
        return (error as ScanInputError).path;
      }
      return null;
    };

    expect(path({ githubUrl: 'https://gitlab.com/acme/x' })).toBe('githubUrl');
    expect(path({ repositoryId: 'repo_1', ref: 'bad ref' })).toBe('ref');
    expect(path({ repositoryId: 'repo_1', profile: 'deep' })).toBe('profile');
    expect(path(null)).toBe('body');
  });
});

describe('validateScanCancel (docs/api.md §3.4)', () => {
  it('accepts a missing or empty body', () => {
    expect(validateScanCancel(undefined)).toEqual({});
    expect(validateScanCancel({})).toEqual({});
    expect(validateScanCancel({ reason: '   ' })).toEqual({});
  });

  it('trims a reason', () => {
    expect(validateScanCancel({ reason: ' Superseded ' })).toEqual({ reason: 'Superseded' });
  });

  it('rejects a non-string or oversized reason', () => {
    expect(() => validateScanCancel({ reason: 5 })).toThrow(ScanInputError);
    expect(() => validateScanCancel({ reason: 'x'.repeat(501) })).toThrow(ScanInputError);
  });
});

describe('scanSubmitPath / quota (docs/design.md §5.5)', () => {
  it('builds the create-scan path', () => {
    expect(scanSubmitPath()).toBe('/api/v1/scan');
  });

  it('treats a quota as exhausted only when a positive limit is reached', () => {
    expect(quotaExhausted({ used: 10, limit: 10 })).toBe(true);
    expect(quotaExhausted({ used: 11, limit: 10 })).toBe(true);
    expect(quotaExhausted({ used: 9, limit: 10 })).toBe(false);
    expect(quotaExhausted({ used: 3, limit: 0 })).toBe(false);
    expect(quotaExhausted(null)).toBe(false);
  });
});

describe('createIdempotencyKey', () => {
  it('mints a v4 UUID and never repeats', () => {
    const first = createIdempotencyKey();
    const second = createIdempotencyKey();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});

describe('fixture scan pipeline', () => {
  it('exposes a queued-running scan for the progress view', () => {
    const running = getFixtureScan(FIXTURE_RUNNING_SCAN_ID);

    expect(running.status).toBe('scanning');
    expect(FIXTURE_SCANS).toHaveLength(3);
  });

  it('lists events in order for a completed scan', () => {
    const events = getFixtureScanEvents(FIXTURE_SCAN_ID);

    expect(events[0]?.type).toBe('queued');
    expect(events.map((entry) => entry.type)).toContain('scanner_completed');
    expect(events.at(-1)?.type).toBe('completed');
  });

  it('includes the timeout that made coverage partial', () => {
    const events = getFixtureScanEvents(FIXTURE_PARTIAL_SCAN_ID);

    expect(events.map((entry) => entry.type)).toContain('scanner_timed_out');
  });

  it('returns copies so callers cannot mutate fixture state', () => {
    const first = getFixtureScanEvents(FIXTURE_SCAN_ID);
    first[0]!.type = 'tampered';

    expect(getFixtureScanEvents(FIXTURE_SCAN_ID)[0]?.type).toBe('queued');
  });

  it('rejects an unknown scan', () => {
    expect(() => getFixtureScanEvents('0f000000-0000-4000-8000-0000000000ff')).toThrow(
      FixtureNotFoundError,
    );
  });
});
