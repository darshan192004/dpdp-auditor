import { describe, expect, it, vi } from 'vitest';
import { InternalFindingsController } from '../src/modules/findings/internal-findings.controller.js';
import type { FindingsService } from '../src/modules/findings/findings.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const FINDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-4222-9222-222222222222';

function make() {
  const service = {
    list: vi.fn().mockResolvedValue({ data: [], pagination: {} }),
    triage: vi.fn().mockResolvedValue({ id: FINDING_ID }),
  };
  const controller = new InternalFindingsController(service as unknown as FindingsService);
  return { controller, service };
}

describe('InternalFindingsController (P4-17)', () => {
  it('defaults pagination when the query is empty', async () => {
    const { controller, service } = make();

    await controller.list(ORG_ID, SCAN_ID, {});

    expect(service.list).toHaveBeenCalledWith(ORG_ID, SCAN_ID, { page: 1, pageSize: 50 });
  });

  it('normalises single values, arrays, and numeric strings', async () => {
    const { controller, service } = make();

    await controller.list(ORG_ID, SCAN_ID, {
      severity: ['critical', 'high'],
      scanner: 'semgrep',
      section: '8(4)',
      status: ['open'],
      file: 'src/',
      q: 'logger',
      sort: '-createdAt',
      page: '2',
      pageSize: '10',
    });

    expect(service.list).toHaveBeenCalledWith(ORG_ID, SCAN_ID, {
      severity: ['critical', 'high'],
      scanner: ['semgrep'],
      section: ['8(4)'],
      status: ['open'],
      file: 'src/',
      q: 'logger',
      sort: '-createdAt',
      page: 2,
      pageSize: 10,
    });
  });

  it('rejects a request without an organisation header', async () => {
    const { controller } = make();

    await expect(controller.list(undefined, SCAN_ID, {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('InternalFindingsController triage (P4-18)', () => {
  it('passes the actor through when present', async () => {
    const { controller, service } = make();

    await controller.triage(ORG_ID, USER_ID, FINDING_ID, { status: 'open' });

    expect(service.triage).toHaveBeenCalledWith(ORG_ID, FINDING_ID, {
      status: 'open',
      actorUserId: USER_ID,
    });
  });

  it('omits the actor for a system triage', async () => {
    const { controller, service } = make();

    await controller.triage(ORG_ID, undefined, FINDING_ID, { status: 'open' });

    expect(service.triage).toHaveBeenCalledWith(ORG_ID, FINDING_ID, { status: 'open' });
  });
});
