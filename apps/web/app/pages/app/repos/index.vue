<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import EmptyState from '~/components/ui/EmptyState.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { useAppContext } from '~/composables/useAppContext';
import {
  RepoInputError,
  validateResolveInput,
  validateSaveInput,
  type RepoListView,
  type ResolvedRepoView,
} from '~~/shared/repo';
import { formatTimestamp } from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const { org } = useAppContext();
const canManage = computed(() => ['owner', 'admin'].includes(org.value?.role ?? ''));

const reposRequest = await useFetch<{ data: RepoListView }>('/api/v1/repos');
const repos = computed(() => reposRequest.data.value?.data.items ?? []);
const loading = computed(() => reposRequest.status.value === 'pending');

const loadError = computed(() => {
  const failure = reposRequest.error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'Repositories could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

const form = reactive({ open: false, url: '' });
const resolved = ref<ResolvedRepoView | null>(null);
const pending = ref(false);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);

function messageFrom(cause: unknown): string {
  const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
  return typeof message === 'string' ? message : 'Something went wrong. Try again.';
}

function resetForm(): void {
  form.open = false;
  form.url = '';
  resolved.value = null;
  actionError.value = null;
}

async function resolveUrl(): Promise<void> {
  actionError.value = null;
  notice.value = null;
  resolved.value = null;

  let body: { githubUrl: string };
  try {
    body = validateResolveInput({ githubUrl: form.url });
  } catch (cause) {
    actionError.value =
      cause instanceof RepoInputError ? cause.message : 'Enter a valid GitHub repository URL.';
    return;
  }

  pending.value = true;
  try {
    const response = await $fetch<{ data: ResolvedRepoView }>('/api/v1/repos/resolve', {
      method: 'POST',
      body,
    });
    resolved.value = response.data;
  } catch (cause) {
    actionError.value = messageFrom(cause);
  } finally {
    pending.value = false;
  }
}

async function saveRepo(): Promise<void> {
  actionError.value = null;

  let body: { githubUrl: string };
  try {
    body = validateSaveInput({ githubUrl: form.url });
  } catch (cause) {
    actionError.value =
      cause instanceof RepoInputError ? cause.message : 'Enter a valid GitHub repository URL.';
    return;
  }

  pending.value = true;
  try {
    await $fetch('/api/v1/repos', { method: 'POST', body });
    notice.value = `Connected ${body.githubUrl.replace(/^https:\/\/github\.com\//, '')}.`;
    resetForm();
    await reposRequest.refresh();
  } catch (cause) {
    actionError.value = messageFrom(cause);
  } finally {
    pending.value = false;
  }
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Repositories" :breadcrumbs="[{ label: 'Repositories' }]">
      <template v-if="canManage" #actions>
        <button
          type="button"
          class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          @click="form.open ? resetForm() : (form.open = true)"
        >
          {{ form.open ? 'Cancel' : 'Connect repository' }}
        </button>
      </template>
    </PageHeader>

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
      v-if="form.open && canManage"
      aria-labelledby="connect-heading"
      class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
    >
      <div class="border-ink-200 border-b px-4 py-3">
        <h2 id="connect-heading" class="text-ink-900 text-sm font-semibold">
          Connect a repository
        </h2>
        <p class="text-ink-500 mt-1 text-xs">
          Public GitHub repositories only. Scanning reads the default branch — no credentials are
          stored.
        </p>
      </div>
      <form class="space-y-3 px-4 py-4" novalidate @submit.prevent="resolveUrl">
        <div>
          <label for="repo-url" class="text-ink-700 mb-1 block text-xs font-medium">
            Repository URL
          </label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <input
              id="repo-url"
              v-model="form.url"
              name="githubUrl"
              type="url"
              inputmode="url"
              autocomplete="off"
              placeholder="https://github.com/acme/payments-service"
              :disabled="pending"
              class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <button
              type="submit"
              :disabled="pending"
              class="bg-ink-100 text-ink-800 hover:bg-ink-200 focus-visible:ring-brand-500 inline-flex items-center justify-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {{ pending ? 'Checking…' : 'Preview' }}
            </button>
          </div>
        </div>

        <dl
          v-if="resolved"
          class="border-ink-200 bg-surface-raised grid grid-cols-2 gap-3 rounded-[var(--radius-control)] border px-3 py-3 text-sm sm:grid-cols-4"
        >
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Repository</dt>
            <dd class="text-ink-800 mt-1 font-mono text-xs">{{ resolved.fullName }}</dd>
          </div>
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Branch</dt>
            <dd class="text-ink-800 mt-1 font-mono text-xs">{{ resolved.defaultBranch }}</dd>
          </div>
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Size</dt>
            <dd class="text-ink-800 mt-1 text-sm tabular-nums">
              {{ formatSize(resolved.sizeBytes) }}
            </dd>
          </div>
          <div>
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Visibility</dt>
            <dd class="text-ink-800 mt-1 text-sm capitalize">{{ resolved.visibility }}</dd>
          </div>
        </dl>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="pending || resolved === null"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            @click="saveRepo"
          >
            Connect
          </button>
          <button
            type="button"
            :disabled="pending"
            class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
            @click="resetForm"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="reposRequest.refresh"
    />

    <p v-else-if="loading && repos.length === 0" role="status" class="text-ink-500 text-sm">
      Loading repositories…
    </p>

    <EmptyState
      v-else-if="repos.length === 0"
      title="No repositories connected"
      description="Repositories you connect appear here, with their latest score. Scanning reads the default branch only."
      icon="cloud"
    />

    <section
      v-else
      aria-labelledby="repo-list-heading"
      class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
    >
      <div
        class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
      >
        <h2 id="repo-list-heading" class="text-ink-900 text-sm font-semibold">Connected</h2>
        <span class="text-ink-500 text-xs">
          {{ repos.length }} {{ repos.length === 1 ? 'repository' : 'repositories' }}
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            Connected repositories, their default branch, visibility, and connection date
          </caption>
          <thead
            class="text-ink-400 border-ink-200 border-b font-mono text-xs tracking-widest uppercase"
          >
            <tr>
              <th scope="col" class="px-4 py-2 font-medium">Repository</th>
              <th scope="col" class="px-4 py-2 font-medium">Branch</th>
              <th scope="col" class="px-4 py-2 font-medium">Visibility</th>
              <th scope="col" class="px-4 py-2 font-medium">Connected</th>
              <th scope="col" class="px-4 py-2 text-right font-medium">
                <span class="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-ink-200 divide-y">
            <tr v-for="repo in repos" :key="repo.id">
              <td class="px-4 py-3">
                <NuxtLink
                  :to="`/app/repos/${encodeURIComponent(repo.id)}`"
                  class="text-ink-900 hover:text-brand-600 focus-visible:ring-brand-500 rounded-[var(--radius-control)] font-mono text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {{ repo.fullName }}
                </NuxtLink>
              </td>
              <td class="text-ink-600 px-4 py-3 font-mono text-xs">{{ repo.defaultBranch }}</td>
              <td class="text-ink-700 px-4 py-3 text-xs capitalize">{{ repo.visibility }}</td>
              <td class="text-ink-600 px-4 py-3 text-xs tabular-nums">
                {{ formatTimestamp(repo.connectedAt) }}
              </td>
              <td class="px-4 py-3 text-right">
                <NuxtLink
                  :to="`/app/repos/${encodeURIComponent(repo.id)}`"
                  class="text-ink-600 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  View
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
