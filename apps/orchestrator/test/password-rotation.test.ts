import { describe, expect, it, vi } from 'vitest';

import { PasswordLoginService } from '../src/modules/identity/password-login.service.js';

function makeService() {
  const user = {
    id: '22222222-2222-4222-9222-222222222222',
    email: 'a@b.test',
    name: 'A',
    avatarUrl: null,
    passwordHash: 'stored-hash',
    deletedAt: null,
    mustChangePassword: true,
  };
  const users = {
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    updateCredentials: vi.fn().mockResolvedValue({
      ...user,
      passwordHash: 'new-hash',
      mustChangePassword: false,
    }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const limits = { consume: vi.fn().mockResolvedValue(true) };
  const verify = vi.fn().mockResolvedValue(true);
  const hash = vi.fn().mockResolvedValue('new-hash');
  return {
    service: new PasswordLoginService(users as never, audit as never, limits, verify, hash),
    users,
    audit,
    limits,
    verify,
    hash,
  };
}

const valid = {
  userId: '22222222-2222-4222-9222-222222222222',
  currentPassword: 'temporary-passphrase',
  newPassword: 'a-brand-new-passphrase',
};

describe('PasswordLoginService.changePassword', () => {
  it('hashes the new password and clears the rotation flag', async () => {
    const { service, users, audit, hash } = makeService();
    await expect(service.changePassword(valid)).resolves.toEqual({ ok: true });
    expect(hash).toHaveBeenCalledWith(valid.newPassword);
    expect(users.updateCredentials).toHaveBeenCalledWith(valid.userId, {
      passwordHash: 'new-hash',
      mustChangePassword: false,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.password_changed', actorUserId: valid.userId }),
    );
  });

  it('rejects a wrong current password without writing', async () => {
    const { service, users, verify } = makeService();
    verify.mockResolvedValue(false);
    await expect(service.changePassword(valid)).rejects.toThrow('Current password is incorrect.');
    expect(users.updateCredentials).not.toHaveBeenCalled();
  });

  it('rejects a new password shorter than 12 characters', async () => {
    const { service, users } = makeService();
    await expect(service.changePassword({ ...valid, newPassword: 'short' })).rejects.toThrow();
    expect(users.updateCredentials).not.toHaveBeenCalled();
  });
});
