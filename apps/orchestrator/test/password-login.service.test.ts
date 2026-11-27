import { describe, expect, it, vi } from 'vitest';

import { PasswordLoginService } from '../src/modules/identity/password-login.service.js';

function makeService() {
  const users = {
    findByEmail: vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'a@b.test',
      name: 'A',
      avatarUrl: null,
      passwordHash: 'stored-hash',
      deletedAt: null,
      mustChangePassword: true,
    }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const limits = { consume: vi.fn().mockResolvedValue(true) };
  const verify = vi.fn().mockResolvedValue(true);
  return {
    service: new PasswordLoginService(users as never, audit as never, limits, verify),
    users,
    audit,
    limits,
    verify,
  };
}

describe('PasswordLoginService', () => {
  it('returns the user and rotation flag for valid credentials', async () => {
    const { service, audit, limits } = makeService();
    const result = await service.login({
      email: 'a@b.test',
      password: 'correct horse battery staple',
      ip: '127.0.0.1',
    });
    expect(result.user.id).toBe('u1');
    expect(result.mustChangePassword).toBe(true);
    expect(limits.consume).toHaveBeenCalledWith('pw-login:email:a@b.test', 5, 900);
    expect(limits.consume).toHaveBeenCalledWith('pw-login:ip:127.0.0.1', 20, 900);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', metadata: { method: 'password' } }),
    );
  });

  it('rejects a user without a password hash', async () => {
    const { service, users, audit } = makeService();
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'a@b.test',
      name: 'A',
      avatarUrl: null,
      passwordHash: null,
      deletedAt: null,
      mustChangePassword: true,
    });
    await expect(
      service.login({ email: 'a@b.test', password: 'correct horse battery staple' }),
    ).rejects.toThrow('Invalid email or password.');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses a login that exceeds the email rate limit', async () => {
    const { service, limits } = makeService();
    limits.consume.mockResolvedValueOnce(false);
    await expect(
      service.login({ email: 'a@b.test', password: 'correct horse battery staple' }),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('refuses a login that exceeds the IP rate limit', async () => {
    const { service, limits } = makeService();
    limits.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(
      service.login({
        email: 'a@b.test',
        password: 'correct horse battery staple',
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Invalid email or password.');
  });
});
