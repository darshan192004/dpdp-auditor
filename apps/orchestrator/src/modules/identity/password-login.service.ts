import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersRepository } from './users.repository.js';
import { passwordLoginSchema, type PasswordLoginInput } from './identity.schemas.js';
import { hashPassword, verifyPassword } from './password.js';

export interface RateLimitGate {
  /** Atomically counts this attempt and reports whether it is within policy. */
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

/** DI tokens: interfaces/functions disappear at runtime, so Nest needs explicit keys. */
export const RATE_LIMIT_GATE = Symbol('RATE_LIMIT_GATE');
export const VERIFY_PASSWORD = Symbol('VERIFY_PASSWORD');

export interface PasswordLoginResult {
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  mustChangePassword: boolean;
}

const INVALID = 'Invalid email or password.';
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_SECONDS = 15 * 60;

// A real argon2id hash generated once at module load, used only to keep the
// unknown-user failure path constant-time. Never committed as a literal.
const DUMMY_HASH = await hashPassword(randomBytes(32).toString('hex'));

/**
 * Password authentication for the internal pilot. Every failure path verifies
 * against a real argon2id hash and returns the same generic error so an
 * attacker cannot enumerate accounts by timing or message.
 */
@Injectable()
export class PasswordLoginService {
  constructor(
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
    @Inject(RATE_LIMIT_GATE) private readonly limits: RateLimitGate,
    @Inject(VERIFY_PASSWORD)
    private readonly verify: (hash: string, plain: string) => Promise<boolean> = verifyPassword,
  ) {}

  async login(raw: PasswordLoginInput): Promise<PasswordLoginResult> {
    const input = passwordLoginSchema.parse(raw);
    if (
      !(await this.limits.consume(
        `pw-login:email:${input.email.toLowerCase()}`,
        EMAIL_LIMIT,
        WINDOW_SECONDS,
      ))
    ) {
      throw new ApiError('UNAUTHENTICATED', INVALID);
    }
    if (
      input.ip &&
      !(await this.limits.consume(`pw-login:ip:${input.ip}`, IP_LIMIT, WINDOW_SECONDS))
    ) {
      throw new ApiError('UNAUTHENTICATED', INVALID);
    }

    const user = await this.users.findByEmail(input.email);
    const storedHash = user?.passwordHash ?? null;
    const ok = await this.verify(storedHash ?? DUMMY_HASH, input.password);
    if (!user || user.deletedAt || !storedHash || !ok) {
      throw new ApiError('UNAUTHENTICATED', INVALID);
    }

    await this.audit.record({
      orgId: null,
      actorType: 'user',
      actorUserId: user.id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { method: 'password' },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
      },
      mustChangePassword: user.mustChangePassword,
    };
  }
}
