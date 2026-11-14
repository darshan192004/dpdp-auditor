<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import {
  canManageOrg,
  MEMBER_ROLES,
  OrgInputError,
  parseAddMember,
  parseOrgPatch,
  parseRoleChange,
  RETENTION_MAX,
  RETENTION_MIN,
  type MemberRole,
  type OrgDetail,
  type OrgMember,
} from '~~/shared/org';
import { formatTimestamp } from '~~/shared/scan';

definePageMeta({ layout: 'app' });

// Both reads are tenant-scoped by the session; the role inside `OrgDetail`
// decides which controls render (docs/api.md §7.2–7.3).
const orgRequest = await useFetch<{ data: OrgDetail }>('/api/v1/org');
const membersRequest = await useFetch<{ data: OrgMember[] }>('/api/v1/org/members');

const org = computed(() => orgRequest.data.value?.data ?? null);
const members = computed(() => membersRequest.data.value?.data ?? []);
const canManage = computed(() => canManageOrg(org.value?.role));
const isOwner = computed(() => org.value?.role === 'owner');
const loading = computed(() => orgRequest.status.value === 'pending');

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  auditor: 'Auditor',
  viewer: 'Viewer',
};

const ROLE_HELP: Record<MemberRole, string> = {
  owner: 'Full control, including billing and other owners.',
  admin: 'Manage settings, members, and scans.',
  auditor: 'Run scans and triage findings.',
  viewer: 'Read-only access to results.',
};

const profile = reactive({ name: '', retentionDays: RETENTION_MIN, notifications: false });

watch(
  org,
  (value) => {
    if (value === null) return;
    profile.name = value.name;
    profile.retentionDays = value.retentionDays;
    profile.notifications = value.settings?.notifications === true;
  },
  { immediate: true },
);

const pending = ref(false);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);

const addForm = reactive({ email: '', role: 'viewer' as MemberRole });
const confirmingRemoval = ref<string | null>(null);

const loadError = computed(() => {
  const failure = orgRequest.error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'The organisation could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

function messageFrom(cause: unknown): string {
  const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
  return typeof message === 'string' ? message : 'Something went wrong. Try again.';
}

/** Validates a shared-contract input, surfacing the field message inline. */
function input<T>(parse: () => T): T | null {
  try {
    return parse();
  } catch (cause) {
    actionError.value =
      cause instanceof OrgInputError ? cause.message : 'Check the form and try again.';
    return null;
  }
}

async function run(action: () => Promise<void>, success: string): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  actionError.value = null;
  notice.value = null;
  try {
    await action();
    notice.value = success;
  } catch (cause) {
    actionError.value = messageFrom(cause);
  } finally {
    pending.value = false;
  }
}

async function saveProfile(): Promise<void> {
  const body = input(() => parseOrgPatch({ name: profile.name }));
  if (body === null) return;

  await run(async () => {
    await $fetch('/api/v1/org', { method: 'PATCH', body });
    await orgRequest.refresh();
  }, 'Organisation name saved.');
}

async function saveRetention(): Promise<void> {
  const body = input(() => parseOrgPatch({ retentionDays: profile.retentionDays }));
  if (body === null) return;

  await run(async () => {
    await $fetch('/api/v1/org', { method: 'PATCH', body });
    await orgRequest.refresh();
  }, 'Retention window saved.');
}

async function saveNotifications(): Promise<void> {
  const body = input(() => parseOrgPatch({ settings: { notifications: profile.notifications } }));
  if (body === null) return;

  await run(async () => {
    await $fetch('/api/v1/org', { method: 'PATCH', body });
    await orgRequest.refresh();
  }, 'Notification preference saved.');
}

async function addMember(): Promise<void> {
  const body = input(() => parseAddMember({ email: addForm.email, role: addForm.role }));
  if (body === null) return;

  await run(async () => {
    await $fetch('/api/v1/org/members', { method: 'POST', body });
    addForm.email = '';
    addForm.role = 'viewer';
    await membersRequest.refresh();
  }, `Added ${body.email}.`);
}

/** Only owners may grant, change, or remove the owner role (api.md §7.3). */
function canTouch(member: OrgMember): boolean {
  return canManage.value && (member.role !== 'owner' || isOwner.value);
}

async function changeRole(member: OrgMember, event: Event): Promise<void> {
  const selected = (event.target as HTMLSelectElement).value;
  const body = input(() => ({ role: parseRoleChange({ role: selected }) }));
  if (body === null) return;
  if (body.role === member.role) return;

  await run(async () => {
    await $fetch(`/api/v1/org/members/${encodeURIComponent(member.userId)}`, {
      method: 'PATCH',
      body,
    });
    await membersRequest.refresh();
  }, `Updated ${member.email} to ${ROLE_LABELS[body.role]}.`);
}

async function removeMember(member: OrgMember): Promise<void> {
  await run(async () => {
    await $fetch(`/api/v1/org/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE' });
    confirmingRemoval.value = null;
    await membersRequest.refresh();
  }, `Removed ${member.email}.`);
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Organisation settings" :breadcrumbs="[{ label: 'Settings' }]" />

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="orgRequest.refresh"
    />

    <p v-else-if="loading && org === null" role="status" class="text-ink-500 text-sm">
      Loading organisation…
    </p>

    <template v-else-if="org !== null">
      <p
        v-if="actionError"
        role="alert"
        class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
      >
        {{ actionError }}
      </p>
      <p
        v-else-if="notice"
        role="status"
        class="bg-status-compliant-bg text-status-compliant-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
      >
        {{ notice }}
      </p>

      <p
        v-if="!canManage"
        class="bg-surface-raised text-ink-700 rounded-[var(--radius-card)] px-4 py-3 text-sm"
      >
        You have read-only access to this organisation. An owner or admin can change these settings.
      </p>

      <section
        aria-labelledby="org-summary-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div
          class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
        >
          <h2 id="org-summary-heading" class="text-ink-900 text-sm font-semibold">Workspace</h2>
          <span
            class="border-ink-200 bg-ink-50 text-ink-700 inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium"
          >
            {{ ROLE_LABELS[org.role] }}
          </span>
        </div>
        <dl
          class="divide-ink-200 grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x"
        >
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Workspace URL</dt>
            <dd class="text-ink-800 mt-1 font-mono text-xs">{{ org.slug }}</dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Plan</dt>
            <dd class="text-ink-800 mt-1 text-sm capitalize">{{ org.plan }}</dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Data region</dt>
            <dd class="text-ink-800 mt-1 font-mono text-xs">{{ org.dataRegion }}</dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">
              Concurrent scans
            </dt>
            <dd class="text-ink-800 mt-1 text-sm tabular-nums">{{ org.scanConcurrency }}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="org-profile-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 id="org-profile-heading" class="text-ink-900 text-sm font-semibold">Profile</h2>
        </div>
        <form class="space-y-3 px-4 py-4" novalidate @submit.prevent="saveProfile">
          <div>
            <label for="org-name" class="text-ink-700 mb-1 block text-xs font-medium">
              Organisation name
            </label>
            <input
              id="org-name"
              v-model="profile.name"
              name="name"
              type="text"
              autocomplete="organization"
              :disabled="!canManage || pending"
              class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full max-w-md rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
          <button
            type="submit"
            :disabled="!canManage || pending"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save name
          </button>
        </form>
      </section>

      <section
        aria-labelledby="org-retention-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 id="org-retention-heading" class="text-ink-900 text-sm font-semibold">
            Data retention
          </h2>
        </div>
        <form class="space-y-3 px-4 py-4" novalidate @submit.prevent="saveRetention">
          <div>
            <label for="org-retention" class="text-ink-700 mb-1 block text-xs font-medium">
              Keep scans and findings for
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <input
                id="org-retention"
                v-model.number="profile.retentionDays"
                name="retentionDays"
                type="number"
                inputmode="numeric"
                :min="RETENTION_MIN"
                :max="RETENTION_MAX"
                :disabled="!canManage || pending"
                class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-24 rounded-[var(--radius-control)] border px-3 py-2 text-sm tabular-nums focus-visible:ring-2 focus-visible:outline-none"
              />
              <span class="text-ink-600 text-sm">days</span>
            </div>
            <p class="text-ink-500 mt-1 text-xs">
              Between {{ RETENTION_MIN }} and {{ RETENTION_MAX }} days. Evidence older than the
              window is deleted.
            </p>
          </div>
          <button
            type="submit"
            :disabled="!canManage || pending"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save retention
          </button>
        </form>
      </section>

      <section
        aria-labelledby="org-notifications-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 id="org-notifications-heading" class="text-ink-900 text-sm font-semibold">
            Notifications
          </h2>
        </div>
        <div class="space-y-3 px-4 py-4">
          <label class="flex items-start gap-2 text-sm">
            <input
              v-model="profile.notifications"
              type="checkbox"
              :disabled="!canManage || pending"
              class="focus-visible:ring-brand-500 mt-0.5 h-4 w-4 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none"
            />
            <span>
              <span class="text-ink-800 block font-medium"
                >Email me about new critical findings</span
              >
              <span class="text-ink-500 block text-xs">
                Sent to owners and admins after a scan completes.
              </span>
            </span>
          </label>
          <button
            type="button"
            :disabled="!canManage || pending"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            @click="saveNotifications"
          >
            Save preference
          </button>
        </div>
      </section>

      <section
        aria-labelledby="org-members-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div
          class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
        >
          <h2 id="org-members-heading" class="text-ink-900 text-sm font-semibold">Members</h2>
          <span class="text-ink-500 text-xs">
            {{ members.length }} {{ members.length === 1 ? 'member' : 'members' }}
          </span>
        </div>

        <form
          v-if="canManage"
          class="border-ink-200 border-b px-4 py-4"
          novalidate
          @submit.prevent="addMember"
        >
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div class="min-w-0 flex-1">
              <label for="member-email" class="text-ink-700 mb-1 block text-xs font-medium">
                Add an existing account
              </label>
              <input
                id="member-email"
                v-model="addForm.email"
                name="email"
                type="email"
                autocomplete="email"
                :disabled="pending"
                placeholder="teammate@acme.example"
                class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
            <div class="sm:w-40">
              <label for="member-role" class="text-ink-700 mb-1 block text-xs font-medium">
                Role
              </label>
              <select
                id="member-role"
                v-model="addForm.role"
                name="role"
                :disabled="pending"
                class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <option
                  v-for="role in MEMBER_ROLES"
                  :key="role"
                  :value="role"
                  :disabled="role === 'owner' && !isOwner"
                >
                  {{ ROLE_LABELS[role] }}
                </option>
              </select>
            </div>
            <div>
              <button
                type="submit"
                :disabled="pending"
                class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex w-full items-center justify-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add member
              </button>
            </div>
          </div>
          <p class="text-ink-500 mt-2 text-xs">
            The person must have signed in once. Invitations for new accounts arrive in a later
            release.
          </p>
        </form>

        <p v-if="members.length === 0" class="text-ink-500 px-4 py-4 text-sm">
          No members to show yet.
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              Organisation members, their role, status, and last sign-in
            </caption>
            <thead
              class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
            >
              <tr>
                <th scope="col" class="px-4 py-2 font-medium">Member</th>
                <th scope="col" class="px-4 py-2 font-medium">Role</th>
                <th scope="col" class="px-4 py-2 font-medium">Status</th>
                <th scope="col" class="px-4 py-2 font-medium">Last sign-in</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-ink-200 divide-y">
              <tr v-for="member in members" :key="member.userId">
                <td class="px-4 py-3">
                  <span class="text-ink-800 block font-medium">{{ member.name ?? 'Unnamed' }}</span>
                  <span class="text-ink-500 block text-xs">{{ member.email }}</span>
                </td>
                <td class="px-4 py-3">
                  <select
                    v-if="canTouch(member)"
                    :value="member.role"
                    :disabled="pending"
                    :aria-label="`Role for ${member.email}`"
                    class="border-ink-200 text-ink-800 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface rounded-[var(--radius-control)] border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                    @change="changeRole(member, $event)"
                  >
                    <option
                      v-for="role in MEMBER_ROLES"
                      :key="role"
                      :value="role"
                      :disabled="role === 'owner' && !isOwner"
                    >
                      {{ ROLE_LABELS[role] }}
                    </option>
                  </select>
                  <span v-else class="text-ink-700 text-xs">{{ ROLE_LABELS[member.role] }}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink-700 text-xs capitalize">{{ member.status }}</span>
                </td>
                <td class="text-ink-600 px-4 py-3 text-xs tabular-nums">
                  {{ formatTimestamp(member.lastLoginAt) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <template v-if="canTouch(member)">
                    <template v-if="confirmingRemoval === member.userId">
                      <span class="text-ink-600 mr-2 text-xs">Remove?</span>
                      <button
                        type="button"
                        :disabled="pending"
                        :aria-label="`Confirm removal of ${member.email}`"
                        class="focus-visible:ring-risk-critical-solid text-risk-critical-text rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
                        @click="removeMember(member)"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        :disabled="pending"
                        class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
                        @click="confirmingRemoval = null"
                      >
                        Cancel
                      </button>
                    </template>
                    <button
                      v-else
                      type="button"
                      :disabled="pending"
                      :aria-label="`Remove ${member.email}`"
                      class="text-ink-600 hover:text-risk-critical-text focus-visible:ring-risk-critical-solid rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
                      @click="confirmingRemoval = member.userId"
                    >
                      Remove
                    </button>
                  </template>
                  <span v-else class="text-ink-400 text-xs">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <dl class="border-ink-200 text-ink-500 grid gap-1 border-t px-4 py-3 text-xs">
          <div v-for="role in MEMBER_ROLES" :key="role" class="flex gap-2">
            <dt class="text-ink-700 w-16 shrink-0 font-medium">{{ ROLE_LABELS[role] }}</dt>
            <dd>{{ ROLE_HELP[role] }}</dd>
          </div>
        </dl>
      </section>

      <p class="text-ink-500 text-xs">
        Plan, data region, and seat changes are billing operations and are not editable here. The
        last active owner cannot be removed or demoted.
      </p>
    </template>
  </div>
</template>
