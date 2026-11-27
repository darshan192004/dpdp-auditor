<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import {
  API_KEY_NAME_MAX,
  API_KEY_NAME_MIN,
  API_KEY_SCOPES,
  ApiKeyInputError,
  parseCreateApiKey,
  type ApiKeyCreated,
  type ApiKeyScope,
  type ApiKeyView,
} from '~~/shared/api-key';
import { formatTimestamp } from '~~/shared/scan';

const keysRequest = await useFetch<{ data: ApiKeyView[] }>('/api/v1/api-keys');

const keys = computed(() => keysRequest.data.value?.data ?? []);
const loading = computed(() => keysRequest.status.value === 'pending');

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  'scan:read': 'Read scans',
  'scan:write': 'Create scans',
  'report:read': 'Read reports',
  'repo:read': 'Read repositories',
};

const SCOPE_HELP: Record<ApiKeyScope, string> = {
  'scan:read': 'View scan status, findings, and scores',
  'scan:write': 'Trigger new scans',
  'report:read': 'Download PDF reports',
  'repo:read': 'List connected repositories',
};

const pending = ref(false);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const createdKey = ref<ApiKeyCreated | null>(null);
const showCreateDialog = ref(false);
const confirmingRevocation = ref<string | null>(null);
const copiedNotice = ref(false);

const panel = ref<HTMLElement | null>(null);
const heading = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const createForm = reactive({
  name: '',
  scopes: ['scan:read'] as ApiKeyScope[],
  expiresAt: null as string | null,
});

const loadError = computed(() => {
  const failure = keysRequest.error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'API keys could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

function messageFrom(cause: unknown): string {
  const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
  return typeof message === 'string' ? message : 'Something went wrong. Try again.';
}

function input<T>(parse: () => T): T | null {
  try {
    return parse();
  } catch (cause) {
    actionError.value =
      cause instanceof ApiKeyInputError ? cause.message : 'Check the form and try again.';
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

function openCreateDialog(): void {
  createForm.name = '';
  createForm.scopes = ['scan:read'];
  createForm.expiresAt = null;
  createdKey.value = null;
  showCreateDialog.value = true;
  actionError.value = null;
}

function closeCreateDialog(): void {
  showCreateDialog.value = false;
  createdKey.value = null;
  actionError.value = null;
}

/** Dismissing mid-request would hide the one-time key once the POST resolves. */
function dismissCreateDialog(): void {
  if (pending.value) return;
  closeCreateDialog();
}

watch(showCreateDialog, async (open) => {
  if (!import.meta.client) return;
  if (open) {
    previouslyFocused = document.activeElement as HTMLElement | null;
    await nextTick();
    heading.value?.focus();
  } else {
    previouslyFocused?.focus();
    previouslyFocused = null;
  }
});

function onKeydown(event: KeyboardEvent): void {
  if (!showCreateDialog.value) return;
  if (event.key === 'Escape') {
    dismissCreateDialog();
    return;
  }
  if (event.key !== 'Tab' || !panel.value) return;

  const controls = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const focusOrder = heading.value ? [heading.value, ...controls] : controls;
  if (focusOrder.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusOrder[0]!;
  const firstControl = controls[0];
  const last = focusOrder[focusOrder.length - 1]!;
  const atBackwardBoundary =
    document.activeElement === first ||
    (firstControl !== undefined && document.activeElement === firstControl);
  if (event.shiftKey && atBackwardBoundary) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

async function createApiKey(): Promise<void> {
  const body = input(() =>
    parseCreateApiKey({
      name: createForm.name,
      scopes: createForm.scopes,
      expiresAt: createForm.expiresAt,
    }),
  );
  if (body === null) return;

  await run(async () => {
    const response = await $fetch<{ data: ApiKeyCreated }>('/api/v1/api-keys', {
      method: 'POST',
      body,
    });
    createdKey.value = response.data;
    await keysRequest.refresh();
  }, '');
}

async function revokeApiKey(key: ApiKeyView): Promise<void> {
  await run(async () => {
    await $fetch(`/api/v1/api-keys/${encodeURIComponent(key.id)}`, { method: 'DELETE' });
    confirmingRevocation.value = null;
    await keysRequest.refresh();
  }, `Revoked ${key.name}.`);
}

function toggleScope(scope: ApiKeyScope): void {
  const index = createForm.scopes.indexOf(scope);
  if (index === -1) {
    createForm.scopes.push(scope);
  } else {
    createForm.scopes.splice(index, 1);
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copiedNotice.value = true;
    setTimeout(() => {
      copiedNotice.value = false;
    }, 2000);
  } catch {
    // Clipboard access denied; show the key for manual copy
  }
}

function scopeList(scopes: string[]): string {
  return scopes.map((s) => SCOPE_LABELS[s as ApiKeyScope] ?? s).join(', ');
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="API keys" :breadcrumbs="[{ label: 'Settings' }, { label: 'API keys' }]" />

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="keysRequest.refresh"
    />

    <p v-else-if="loading && keys.length === 0" role="status" class="text-ink-500 text-sm">
      Loading API keys…
    </p>

    <template v-else>
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

      <section
        aria-labelledby="api-keys-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div
          class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
        >
          <h2 id="api-keys-heading" class="text-ink-900 text-sm font-semibold">API keys</h2>
          <button
            type="button"
            :disabled="pending"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            @click="openCreateDialog"
          >
            Create API key
          </button>
        </div>

        <div class="border-ink-200 border-b px-4 py-3">
          <p class="text-ink-600 text-sm">
            API keys allow CI tools and scripts to trigger scans and read results. Keys are scoped
            to the actions they can perform. Treat keys like passwords and store them securely.
          </p>
        </div>

        <p v-if="keys.length === 0" class="text-ink-500 px-4 py-4 text-sm">
          No API keys yet. Create one to integrate with CI or automation tools.
        </p>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              API keys, their scopes, expiry, and last use
            </caption>
            <thead
              class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
            >
              <tr>
                <th scope="col" class="px-4 py-2 font-medium">Name</th>
                <th scope="col" class="px-4 py-2 font-medium">Prefix</th>
                <th scope="col" class="px-4 py-2 font-medium">Scopes</th>
                <th scope="col" class="px-4 py-2 font-medium">Last used</th>
                <th scope="col" class="px-4 py-2 font-medium">Expires</th>
                <th scope="col" class="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-ink-200 divide-y">
              <tr v-for="key in keys" :key="key.id">
                <td class="px-4 py-3">
                  <span class="text-ink-800 block font-medium">{{ key.name }}</span>
                  <span v-if="key.createdBy" class="text-ink-500 block text-xs">
                    Created {{ formatTimestamp(key.createdAt) }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <code class="text-ink-700 text-xs">{{ key.prefix }}...</code>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink-700 text-xs">{{ scopeList(key.scopes) }}</span>
                </td>
                <td class="text-ink-600 px-4 py-3 text-xs tabular-nums">
                  {{ formatTimestamp(key.lastUsedAt) }}
                </td>
                <td class="text-ink-600 px-4 py-3 text-xs tabular-nums">
                  <span v-if="key.revokedAt" class="text-risk-critical-text font-medium">
                    Revoked
                  </span>
                  <span v-else>
                    {{ key.expiresAt ? formatTimestamp(key.expiresAt) : 'Never' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <template v-if="!key.revokedAt">
                    <template v-if="confirmingRevocation === key.id">
                      <span class="text-ink-600 mr-2 text-xs">Revoke?</span>
                      <button
                        type="button"
                        :disabled="pending"
                        :aria-label="`Confirm revocation of ${key.name}`"
                        class="focus-visible:ring-risk-critical-solid text-risk-critical-text rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
                        @click="revokeApiKey(key)"
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        :disabled="pending"
                        class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
                        @click="confirmingRevocation = null"
                      >
                        Cancel
                      </button>
                    </template>
                    <button
                      v-else
                      type="button"
                      :disabled="pending"
                      :aria-label="`Revoke ${key.name}`"
                      class="text-ink-600 hover:text-risk-critical-text focus-visible:ring-risk-critical-solid rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
                      @click="confirmingRevocation = key.id"
                    >
                      Revoke
                    </button>
                  </template>
                  <span v-else class="text-ink-400 text-xs">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <dl class="border-ink-200 text-ink-500 grid gap-1 border-t px-4 py-3 text-xs">
          <div v-for="scope in API_KEY_SCOPES" :key="scope" class="flex gap-2">
            <dt class="text-ink-700 w-32 shrink-0 font-mono text-xs">{{ scope }}</dt>
            <dd>{{ SCOPE_HELP[scope] }}</dd>
          </div>
        </dl>
      </section>

      <p class="text-ink-500 text-xs">
        Revoked keys stop working within 30 seconds. API keys inherit the organisation's rate limits
        and scan limits.
      </p>
    </template>

    <!-- Create API key dialog -->
    <div
      v-if="showCreateDialog"
      role="dialog"
      aria-labelledby="create-key-heading"
      aria-modal="true"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="dismissCreateDialog"
    >
      <div
        ref="panel"
        class="bg-surface max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-card)] shadow-[var(--shadow-modal)]"
      >
        <div class="border-ink-200 flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2
            id="create-key-heading"
            ref="heading"
            tabindex="-1"
            class="text-ink-900 text-base font-semibold focus:outline-none"
          >
            {{ createdKey ? 'API key created' : 'Create API key' }}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
            @click="dismissCreateDialog"
          >
            ×
          </button>
        </div>

        <template v-if="createdKey">
          <div class="space-y-4 px-4 py-4">
            <p class="text-ink-700 text-sm">
              Your API key has been created. Copy it now — it will not be shown again.
            </p>

            <div class="bg-ink-50 border-ink-200 rounded-[var(--radius-control)] border p-3">
              <label for="created-key" class="text-ink-600 mb-1 block text-xs font-medium">
                API key
              </label>
              <div class="flex gap-2">
                <input
                  id="created-key"
                  :value="createdKey.key"
                  readonly
                  class="border-ink-200 text-ink-900 bg-surface flex-1 rounded-[var(--radius-control)] border px-3 py-2 font-mono text-xs"
                />
                <button
                  type="button"
                  class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  @click="copyToClipboard(createdKey.key)"
                >
                  {{ copiedNotice ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>

            <dl class="text-ink-600 space-y-2 text-sm">
              <div class="flex justify-between">
                <dt class="font-medium">Name</dt>
                <dd>{{ createdKey.name }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="font-medium">Scopes</dt>
                <dd>{{ scopeList(createdKey.scopes) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="font-medium">Expires</dt>
                <dd>
                  {{ createdKey.expiresAt ? formatTimestamp(createdKey.expiresAt) : 'Never' }}
                </dd>
              </div>
            </dl>

            <div
              class="bg-status-warning-bg text-status-warning-text rounded-[var(--radius-control)] px-3 py-2 text-xs"
            >
              Store this key securely. Anyone with this key can perform actions on your behalf
              within the scopes you've granted.
            </div>
          </div>

          <div class="border-ink-200 border-t px-4 py-3">
            <button
              type="button"
              class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 w-full rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              @click="dismissCreateDialog"
            >
              Done
            </button>
          </div>
        </template>

        <form v-else class="space-y-4 px-4 py-4" novalidate @submit.prevent="createApiKey">
          <div>
            <label for="key-name" class="text-ink-700 mb-1 block text-xs font-medium"> Name </label>
            <input
              id="key-name"
              v-model="createForm.name"
              name="name"
              type="text"
              :disabled="pending"
              :minlength="API_KEY_NAME_MIN"
              :maxlength="API_KEY_NAME_MAX"
              placeholder="GitHub Actions — payments-service"
              class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <p class="text-ink-500 mt-1 text-xs">
              A descriptive name to help you identify where this key is used.
            </p>
          </div>

          <div>
            <fieldset>
              <legend class="text-ink-700 mb-2 text-xs font-medium">Scopes</legend>
              <div class="space-y-2">
                <label
                  v-for="scope in API_KEY_SCOPES"
                  :key="scope"
                  class="flex items-start gap-2 text-sm"
                >
                  <input
                    :checked="createForm.scopes.includes(scope)"
                    type="checkbox"
                    :disabled="pending"
                    class="focus-visible:ring-brand-500 mt-0.5 h-4 w-4 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:outline-none"
                    @change="toggleScope(scope)"
                  />
                  <span>
                    <span class="text-ink-800 block font-mono text-xs font-medium">{{
                      scope
                    }}</span>
                    <span class="text-ink-500 block text-xs">{{ SCOPE_HELP[scope] }}</span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          <div>
            <label for="key-expiry" class="text-ink-700 mb-1 block text-xs font-medium">
              Expiry (optional)
            </label>
            <input
              id="key-expiry"
              v-model="createForm.expiresAt"
              name="expiresAt"
              type="datetime-local"
              :disabled="pending"
              class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <p class="text-ink-500 mt-1 text-xs">Leave blank for a key that never expires.</p>
          </div>

          <p
            v-if="actionError"
            role="alert"
            class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
          >
            {{ actionError }}
          </p>

          <div class="flex gap-2">
            <button
              type="submit"
              :disabled="pending"
              class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 flex-1 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create key
            </button>
            <button
              type="button"
              :disabled="pending"
              class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 border-ink-200 flex-1 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
              @click="dismissCreateDialog"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
