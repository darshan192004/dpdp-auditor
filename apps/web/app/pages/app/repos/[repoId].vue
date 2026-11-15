<script setup lang="ts">
import { computed, ref } from 'vue';

import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { useAppContext } from '~/composables/useAppContext';
import type { RepoDetailView } from '~~/shared/repo';
import { formatTimestamp } from '~~/shared/scan';

definePageMeta({ layout: 'app' });

const route = useRoute();
const repoId = computed(() => String(route.params.repoId ?? ''));
const { org } = useAppContext();
const canManage = computed(() => ['owner', 'admin'].includes(org.value?.role ?? ''));

const repoRequest = await useFetch<{ data: RepoDetailView }>(
  () => `/api/v1/repos/${encodeURIComponent(repoId.value)}`,
);
const repo = computed(() => repoRequest.data.value?.data ?? null);
const loading = computed(() => repoRequest.status.value === 'pending');

const loadError = computed(() => {
  const failure = repoRequest.error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  } | null;
  if (!failure) return null;
  return {
    message: failure.data?.error?.message ?? 'This repository could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

const confirming = ref(false);
const pending = ref(false);
const actionError = ref<string | null>(null);

function messageFrom(cause: unknown): string {
  const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
  return typeof message === 'string' ? message : 'Something went wrong. Try again.';
}

async function disconnect(): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  actionError.value = null;
  try {
    await $fetch(`/api/v1/repos/${encodeURIComponent(repoId.value)}`, { method: 'DELETE' });
    await navigateTo('/app/repos');
  } catch (cause) {
    actionError.value = messageFrom(cause);
    confirming.value = false;
  } finally {
    pending.value = false;
  }
}

const TREND_LABELS: Record<'up' | 'down' | 'flat', string> = {
  up: 'Improving',
  down: 'Declining',
  flat: 'Stable',
};
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      :title="repo?.fullName ?? 'Repository'"
      :breadcrumbs="[
        { label: 'Repositories', to: '/app/repos' },
        { label: repo?.fullName ?? 'Detail' },
      ]"
    >
      <template v-if="canManage && repo" #actions>
        <button
          type="button"
          :disabled="pending"
          class="text-risk-critical-text focus-visible:ring-risk-critical-solid hover:bg-risk-critical-bg rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
          @click="confirming = true"
        >
          Disconnect
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

    <div
      v-if="confirming"
      role="alertdialog"
      aria-labelledby="disconnect-heading"
      class="border-risk-critical-solid bg-risk-critical-bg rounded-[var(--radius-card)] border px-4 py-4"
    >
      <h2 id="disconnect-heading" class="text-ink-900 text-sm font-semibold">
        Disconnect {{ repo?.fullName }}?
      </h2>
      <p class="text-ink-700 mt-1 text-sm">
        Future scans stop immediately and existing results are removed when the retention window
        ends. This cannot be undone from the UI.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          :disabled="pending"
          class="bg-risk-critical-solid text-ink-50 focus-visible:ring-risk-critical-solid inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          @click="disconnect"
        >
          {{ pending ? 'Disconnecting…' : 'Disconnect repository' }}
        </button>
        <button
          type="button"
          :disabled="pending"
          class="text-ink-700 hover:text-ink-900 focus-visible:ring-brand-500 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
          @click="confirming = false"
        >
          Keep connected
        </button>
      </div>
    </div>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="repoRequest.refresh"
    />

    <p v-else-if="loading && repo === null" role="status" class="text-ink-500 text-sm">
      Loading repository…
    </p>

    <template v-else-if="repo">
      <section
        aria-labelledby="repo-stats-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 id="repo-stats-heading" class="text-ink-900 text-sm font-semibold">Scan history</h2>
        </div>
        <dl
          class="divide-ink-200 grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-y-0 sm:divide-x"
        >
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Scans</dt>
            <dd class="text-ink-900 mt-1 text-lg font-semibold tabular-nums">
              {{ repo.stats.totalScans }}
            </dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Last score</dt>
            <dd class="text-ink-900 mt-1 text-lg font-semibold tabular-nums">
              {{ repo.stats.lastScore === null ? '—' : repo.stats.lastScore.toFixed(1) }}
            </dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Average</dt>
            <dd class="text-ink-900 mt-1 text-lg font-semibold tabular-nums">
              {{ repo.stats.averageScore === null ? '—' : repo.stats.averageScore.toFixed(1) }}
            </dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Trend</dt>
            <dd class="text-ink-800 mt-1 text-sm">
              {{ repo.stats.trend === null ? 'No data' : TREND_LABELS[repo.stats.trend] }}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="repo-meta-heading"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 id="repo-meta-heading" class="text-ink-900 text-sm font-semibold">Details</h2>
        </div>
        <dl class="divide-ink-200 grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3 lg:divide-x">
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Default branch</dt>
            <dd class="text-ink-800 mt-1 font-mono text-xs">{{ repo.defaultBranch }}</dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Visibility</dt>
            <dd class="text-ink-800 mt-1 text-sm capitalize">{{ repo.visibility }}</dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Language</dt>
            <dd class="text-ink-800 mt-1 text-sm">{{ repo.language ?? 'Unknown' }}</dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Repository size</dt>
            <dd class="text-ink-800 mt-1 text-sm tabular-nums">
              {{ repo.sizeKb === null ? 'Unknown' : `${repo.sizeKb.toLocaleString()} KB` }}
            </dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Connected</dt>
            <dd class="text-ink-800 mt-1 text-xs tabular-nums">
              {{ formatTimestamp(repo.connectedAt) }}
            </dd>
          </div>
          <div class="px-4 py-3">
            <dt class="text-ink-400 font-mono text-xs tracking-widest uppercase">Last scanned</dt>
            <dd class="text-ink-800 mt-1 text-xs tabular-nums">
              {{ formatTimestamp(repo.lastScannedAt) }}
            </dd>
          </div>
        </dl>
      </section>

      <p v-if="repo.isArchived" class="text-ink-600 bg-surface-raised rounded-[var(--radius-card)] px-4 py-3 text-sm">
        This repository is archived on GitHub. New scans may fail until it is unarchived.
      </p>
    </template>
  </div>
</template>
