/**
 * Organisation and member contract shared by the BFF handlers, the settings
 * page, and their tests (docs/api.md §7.2–7.3). Pure so validation rules can be
 * unit-tested without mounting a handler.
 */
export const MEMBER_ROLES = ['owner', 'admin', 'auditor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ['invited', 'active', 'suspended'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Roles that may edit organisation settings and manage members. */
export const ORG_MANAGER_ROLES: readonly MemberRole[] = ['owner', 'admin'];

export interface OrgSettings {
  notifications?: boolean;
  [key: string]: unknown;
}

/** `GET /api/v1/org` (api.md §7.2). */
export interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  dataRegion: string;
  retentionDays: number;
  scanConcurrency: number;
  settings: OrgSettings;
  role: MemberRole;
}

/** `GET /api/v1/org/members` (api.md §7.3). */
export interface OrgMember {
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  lastLoginAt: string | null;
}

export interface CreateOrgInput {
  name: string;
  slug: string;
}

export interface OrgPatchInput {
  name?: string;
  retentionDays?: number;
  settings?: { notifications?: boolean };
}

export interface AddMemberInput {
  email: string;
  role: MemberRole;
}

export const ORG_NAME_MIN = 2;
export const ORG_NAME_MAX = 120;
export const RETENTION_MIN = 7;
export const RETENTION_MAX = 365;
/** database.md §4.1: 3–40 chars, lowercase alphanumeric with inner hyphens. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validation failure carrying the offending field for the error envelope. */
export class OrgInputError extends Error {
  constructor(
    message: string,
    readonly path = 'body',
  ) {
    super(message);
    this.name = 'OrgInputError';
  }
}

export function canManageOrg(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Turns a display name into a candidate slug; the form lets users edit it. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new OrgInputError('The request body must be a JSON object.');
  }
  return raw as Record<string, unknown>;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw new OrgInputError('The name must be a string.', 'name');
  const name = value.trim();
  if (name.length < ORG_NAME_MIN || name.length > ORG_NAME_MAX) {
    throw new OrgInputError(
      `The name must be between ${ORG_NAME_MIN} and ${ORG_NAME_MAX} characters.`,
      'name',
    );
  }
  return name;
}

function parseSlug(value: unknown): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    throw new OrgInputError('The slug must be 3–40 lowercase letters, digits, or hyphens.', 'slug');
  }
  return value;
}

/** Mirrors the orchestrator's `createOrganizationSchema` for the fixture path. */
export function parseCreateOrg(raw: unknown): CreateOrgInput {
  const record = asRecord(raw);
  return { name: parseName(record.name), slug: parseSlug(record.slug) };
}

/** Mirrors the editable subset of `PATCH /api/v1/org` (plan/region excluded). */
export function parseOrgPatch(raw: unknown): OrgPatchInput {
  const record = asRecord(raw);
  const patch: OrgPatchInput = {};

  if (record.name !== undefined) patch.name = parseName(record.name);

  if (record.retentionDays !== undefined) {
    const days = record.retentionDays;
    if (
      typeof days !== 'number' ||
      !Number.isInteger(days) ||
      days < RETENTION_MIN ||
      days > RETENTION_MAX
    ) {
      throw new OrgInputError(
        `Retention must be a whole number of days between ${RETENTION_MIN} and ${RETENTION_MAX}.`,
        'retentionDays',
      );
    }
    patch.retentionDays = days;
  }

  if (record.settings !== undefined) {
    const settings = asRecord(record.settings);
    const notifications = settings.notifications;
    if (notifications !== undefined && typeof notifications !== 'boolean') {
      throw new OrgInputError(
        'settings.notifications must be true or false.',
        'settings.notifications',
      );
    }
    patch.settings = notifications === undefined ? {} : { notifications };
  }

  if (Object.keys(patch).length === 0) {
    throw new OrgInputError('Provide at least one setting to update.');
  }
  return patch;
}

/** Mirrors `addMemberByEmailSchema`: existing accounts only until P2-D. */
export function parseAddMember(raw: unknown): AddMemberInput {
  const record = asRecord(raw);
  const email = record.email;
  if (typeof email !== 'string' || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new OrgInputError('Enter a valid email address.', 'email');
  }

  const role = record.role ?? 'viewer';
  if (typeof role !== 'string' || !(MEMBER_ROLES as readonly string[]).includes(role)) {
    throw new OrgInputError('Unknown member role.', 'role');
  }
  return { email, role: role as MemberRole };
}

/** Mirrors `changeRoleSchema.role`. */
export function parseRoleChange(raw: unknown): MemberRole {
  const record = asRecord(raw);
  const role = record.role;
  if (typeof role !== 'string' || !(MEMBER_ROLES as readonly string[]).includes(role)) {
    throw new OrgInputError('Unknown member role.', 'role');
  }
  return role as MemberRole;
}
