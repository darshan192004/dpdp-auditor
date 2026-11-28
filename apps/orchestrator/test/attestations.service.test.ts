import { describe, expect, it, vi } from 'vitest';
import type { Attestation } from '@prisma/client';
import { ApiError } from '../src/common/api-error.js';
import { AttestationsService } from '../src/modules/attestations/attestations.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const REPO = '55555555-5555-4555-8555-555555555555';
const USER = '22222222-2222-4222-9222-222222222222';
const KEY = 'secrets.managed_store';

function row(overrides: Partial<Attestation> = {}): Attestation {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    orgId: ORG,
    repositoryId: REPO,
    key: KEY,
    answer: true,
    note: null,
    attestedBy: USER,
    attestedAt: new Date('2026-11-27T00:00:00.000Z'),
    expiresAt: null,
    createdAt: new Date('2026-11-27T00:00:00.000Z'),
    updatedAt: new Date('2026-11-27T00:00:00.000Z'),
    ...overrides,
  };
}

function make(role: 'owner' | 'admin' | 'viewer' | null = 'owner') {
  const tx = {};
  const repository = {
    upsert: vi.fn().mockResolvedValue(row()),
    list: vi.fn().mockResolvedValue([row()]),
  };
  const repositories = { findActiveById: vi.fn().mockResolvedValue({ id: REPO, orgId: ORG }) };
  const pack = {
    loadV2: vi.fn().mockResolvedValue({
      pack: 'dpdpa-2026.11.0',
      attestationsByKey: new Map([[KEY, [{ code: 'DPDPA-8.4-SECRET-01' }]]]),
    }),
  };
  const identity = {
    getMembership: vi.fn().mockResolvedValue(role === null ? null : { role, status: 'active' }),
  };
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const scoring = { rescoreRepository: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const service = new AttestationsService(
    repository as never,
    repositories as never,
    pack as never,
    identity as never,
    audit as never,
    scoring as never,
    prisma as never,
  );
  return { service, repository, repositories, pack, identity, audit, scoring, prisma, tx };
}

const write = {
  orgId: ORG,
  repositoryId: REPO,
  key: KEY,
  answer: true,
  note: 'Managed credential store is configured.',
  attestedBy: USER,
  expiresAt: '2027-01-01T00:00:00.000Z',
};

describe('attestation service', () => {
  it('accepts an owner write, audits it without the note, and rescores the repository', async () => {
    const { service, repository, audit, scoring, tx } = make('owner');
    await service.set(write);

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: KEY, answer: true, attestedBy: USER }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attestation.upserted',
        resourceType: 'attestation',
        resourceId: row().id,
      }),
      tx,
    );
    expect(JSON.stringify(audit.record.mock.calls[0]![0])).not.toContain(
      'Managed credential store',
    );
    expect(scoring.rescoreRepository).toHaveBeenCalledWith(ORG, REPO, tx);
  });

  it('rejects a viewer write', async () => {
    const { service, repository } = make('viewer');
    await expect(service.set(write)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('rejects a key that is not mapped by the v2 pack', async () => {
    const { service, repository } = make();
    await expect(service.set({ ...write, key: 'unknown.key' })).rejects.toBeInstanceOf(ApiError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('rejects an already expired attestation', async () => {
    const { service, repository } = make();
    await expect(
      service.set({ ...write, expiresAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('rejects a repository id from another organisation', async () => {
    const { service, repositories, repository } = make();
    repositories.findActiveById.mockResolvedValue(null);
    await expect(service.set(write)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
