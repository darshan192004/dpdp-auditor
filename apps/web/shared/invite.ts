/**
 * Invitation contract shared by the BFF handlers, the invite UI, and their tests
 * (docs/api.md, P2-21, P2-22). Pure so validation rules can be unit-tested.
 */
import type { MemberRole } from './org';

export interface InviteInput {
  email: string;
  role: MemberRole;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
}

export interface CreateInviteResult {
  kind: 'member' | 'invite';
  invite?: {
    id: string;
    email: string;
    role: MemberRole;
    expiresAt: string;
    createdAt: string;
  };
  token?: string;
  membership?: {
    orgId: string;
    userId: string;
    role: MemberRole;
  };
}

export interface AcceptInviteResult {
  orgId: string;
  userId: string;
  role: MemberRole;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InviteInputError extends Error {
  constructor(
    message: string,
    readonly path = 'body',
  ) {
    super(message);
    this.name = 'InviteInputError';
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InviteInputError('The request body must be a JSON object.');
  }
  return raw as Record<string, unknown>;
}

export function parseInviteInput(raw: unknown): InviteInput {
  const record = asRecord(raw);
  const email = record.email;
  if (typeof email !== 'string' || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new InviteInputError('Enter a valid email address.', 'email');
  }

  const role = record.role ?? 'viewer';
  const MEMBER_ROLES = ['owner', 'admin', 'auditor', 'viewer'] as const;
  if (typeof role !== 'string' || !(MEMBER_ROLES as readonly string[]).includes(role)) {
    throw new InviteInputError('Unknown member role.', 'role');
  }
  return { email, role: role as MemberRole };
}
