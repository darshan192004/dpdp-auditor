<script setup lang="ts">
import PageHeader from '~/components/shell/PageHeader.vue';

definePageMeta({ layout: 'app' });

// Read-only placeholder. Access, retention, and scan-limit controls land with
// the org administration work; until then the page states what will live here.
const SETTINGS = [
  { label: 'Access', detail: 'Members, roles, and session policy' },
  { label: 'Retention', detail: 'How long scans, findings, and evidence are kept' },
  { label: 'Scan limits', detail: 'Concurrent scans and repository allowance' },
] as const;
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Organisation settings" :breadcrumbs="[{ label: 'Settings' }]" />

    <section
      aria-labelledby="settings-heading"
      class="border-ink-200 bg-surface overflow-hidden rounded-[var(--radius-card)] border"
    >
      <div
        class="border-ink-200 flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
      >
        <h2 id="settings-heading" class="text-ink-900 text-sm font-semibold">Administration</h2>
        <span
          class="border-status-na-border bg-status-na-bg text-status-na-text inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium"
        >
          Not configured
        </span>
      </div>

      <dl class="divide-ink-200 divide-y">
        <div
          v-for="item in SETTINGS"
          :key="item.label"
          class="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
        >
          <dt class="text-ink-800 text-sm font-medium">{{ item.label }}</dt>
          <dd class="text-ink-500 text-xs">{{ item.detail }}</dd>
        </div>
      </dl>
    </section>

    <p class="text-ink-500 text-xs">
      Organisation settings control access, retention, and scan limits. They are managed by an
      administrator once the organisation is fully provisioned.
    </p>
  </div>
</template>
