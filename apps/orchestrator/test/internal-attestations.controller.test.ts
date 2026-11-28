import { describe, expect, it, vi } from 'vitest';
import { InternalAttestationsController } from '../src/modules/attestations/internal-attestations.controller.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPO = '55555555-5555-4555-8555-555555555555';
const USER = '22222222-2222-4222-9222-222222222222';

describe('internal attestations controller', () => {
  it('passes trusted org, repository, and actor into the scoped service', async () => {
    const service = {
      set: vi.fn().mockResolvedValue({ id: 'att-1', answer: true }),
      list: vi.fn().mockResolvedValue([]),
    };
    const controller = new InternalAttestationsController(service as never);

    await controller.put(ORG, REPO, 'secrets.managed_store', {
      answer: true,
      note: 'Managed credential store is configured.',
      expiresAt: '2027-01-01T00:00:00.000Z',
      actorUserId: USER,
    });

    expect(service.set).toHaveBeenCalledWith({
      orgId: ORG,
      repositoryId: REPO,
      key: 'secrets.managed_store',
      answer: true,
      note: 'Managed credential store is configured.',
      expiresAt: '2027-01-01T00:00:00.000Z',
      attestedBy: USER,
    });
  });

  it('lists only through the org/repo path scope', async () => {
    const service = { set: vi.fn(), list: vi.fn().mockResolvedValue([]) };
    const controller = new InternalAttestationsController(service as never);
    await controller.list(ORG, REPO);
    expect(service.list).toHaveBeenCalledWith(ORG, REPO);
  });
});
