/**
 * Public identity shape for `GET /api/v1/me` (docs/api.md §8) and the app
 * context that hydrates from it (design §7.6). Shared so the server handler,
 * the client plugin, and their tests agree on one contract.
 */
export interface MeUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface MeOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  retentionDays: number;
}

export interface MeMembership {
  orgId: string;
  role: string;
  organization: MeOrganization;
}

export interface MePayload {
  user: MeUser;
  memberships: MeMembership[];
  activeOrgId: string | null;
  role: string | null;
  featureFlags: Record<string, boolean>;
}

/** App-context org view; `role` is the signed-in user's role in that org. */
export interface OrgContext extends MeOrganization {
  role: string;
}

/**
 * The session's active organisation, falling back to the first active
 * membership. Pure so the fallback rule is unit-tested once.
 */
export function resolveActiveMembership(
  payload: Pick<MePayload, 'memberships' | 'activeOrgId'>,
): MeMembership | null {
  return (
    payload.memberships.find((membership) => membership.orgId === payload.activeOrgId) ??
    payload.memberships[0] ??
    null
  );
}

export function toOrgContext(
  payload: Pick<MePayload, 'memberships' | 'activeOrgId'>,
): OrgContext | null {
  const active = resolveActiveMembership(payload);
  return active === null ? null : { ...active.organization, role: active.role };
}

/**
 * Normalises the orchestrator's session resolution into the public payload.
 * `activeOrgId` and `role` are derived so the client never has to guess.
 */
export function toMePayload(
  resolved: Pick<MePayload, 'user' | 'memberships' | 'featureFlags'> & {
    session: { activeOrgId: string | null };
  },
): MePayload {
  const active = resolveActiveMembership({
    memberships: resolved.memberships,
    activeOrgId: resolved.session.activeOrgId,
  });
  return {
    user: resolved.user,
    memberships: resolved.memberships,
    activeOrgId: active?.orgId ?? null,
    role: active?.role ?? null,
    featureFlags: resolved.featureFlags,
  };
}
