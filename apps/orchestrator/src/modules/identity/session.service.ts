import { Injectable } from '@nestjs/common';
import type { Session } from '@prisma/client';
import { ApiError } from '../../common/api-error.js';
import { createSessionSchema, type CreateSessionInput } from './identity.schemas.js';
import { SessionsRepository } from './sessions.repository.js';
import { UsersRepository } from './users.repository.js';

/** docs/security.md §3.1: 8 h absolute session lifetime. */
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
/** docs/security.md §3.1: 30-minute idle timeout, enforced server-side. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface SessionView {
  id: string;
  userId: string;
  activeOrgId: string | null;
  absoluteExpiresAt: Date;
}

/**
 * Server-side session records. The sealed cookie proves the session id; this
 * service decides whether that id is still allowed to act.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
  ) {}

  async create(raw: CreateSessionInput): Promise<SessionView> {
    const input = createSessionSchema.parse(raw);
    const user = await this.users.findById(input.userId);
    if (!user || user.deletedAt) throw new ApiError('NOT_FOUND', 'The user does not exist.');

    const session = await this.sessions.create({
      userId: input.userId,
      activeOrgId: input.activeOrgId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      absoluteExpiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
    });
    return toView(session);
  }

  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.sessions.findById(sessionId);
    return isActive(session);
  }

  /**
   * Validates and refreshes the idle clock. Every authenticated request goes
   * through here, so an expired or revoked row fails closed immediately.
   */
  async resolve(sessionId: string): Promise<SessionView> {
    const session = await this.sessions.findById(sessionId);
    if (!session || !isActive(session)) {
      // Revoke lazily so retention has less to clean up; logout already does this.
      if (session && !session.revokedAt) await this.sessions.revoke(sessionId, new Date());
      throw new ApiError('UNAUTHENTICATED', 'The session has expired.');
    }
    await this.sessions.touch(sessionId, new Date());
    return toView(session);
  }

  async touch(sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!isActive(session)) throw new ApiError('UNAUTHENTICATED', 'The session has expired.');
    await this.sessions.touch(sessionId, new Date());
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    // Revoking an already-missing session is idempotent: logout must always work.
    if (!session || session.revokedAt) return;
    await this.sessions.revoke(sessionId, new Date());
  }

  async rotate(sessionId: string, activeOrgId: string | null): Promise<SessionView> {
    const previous = await this.sessions.findById(sessionId);
    if (!previous) throw new ApiError('NOT_FOUND', 'The session does not exist.');
    await this.revoke(sessionId);
    return this.create({ userId: previous.userId, activeOrgId });
  }
}

function isActive(session: Session | null, now = Date.now()): boolean {
  if (!session) return false;
  if (session.revokedAt) return false;
  if (session.absoluteExpiresAt.getTime() <= now) return false;
  return session.lastSeenAt.getTime() > now - SESSION_IDLE_MS;
}

function toView(session: Session): SessionView {
  return {
    id: session.id,
    userId: session.userId,
    activeOrgId: session.activeOrgId,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}
