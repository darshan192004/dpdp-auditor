<script setup lang="ts">
import type { ReadinessAttestation } from '~~/shared/readiness';

defineProps<{ rows: ReadinessAttestation[]; canWrite: boolean }>();

/** A human statement's expiry is state, never code evidence. */
function expiryLabel(expiresAt: string | null): string {
  if (expiresAt === null) return 'No expiry recorded';
  return Date.parse(expiresAt) < Date.now() ? `Expired ${expiresAt}` : `Expires ${expiresAt}`;
}
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-ink-900 text-2xl font-semibold">Attestations</h1>
        <p class="text-ink-500 text-sm">Human statements recorded for this repository.</p>
      </div>
      <button
        v-if="canWrite"
        type="button"
        class="border-ink-200 rounded-[var(--radius-control)] border px-3 py-2"
      >
        Record attestation
      </button>
    </header>
    <ul class="space-y-2">
      <li
        v-for="row in rows"
        :key="row.id"
        class="border-ink-200 rounded-[var(--radius-control)] border p-3"
      >
        <p class="font-mono text-sm">{{ row.key }}</p>
        <p class="text-sm">Attested {{ row.answer ? 'yes' : 'no' }}</p>
        <p class="text-ink-500 text-xs">Recorded {{ row.attestedAt }}</p>
        <p class="text-ink-500 text-xs" data-testid="attestation-expiry">
          {{ expiryLabel(row.expiresAt) }}
        </p>
      </li>
    </ul>
    <p class="text-ink-500 text-xs">
      Attestations are not code evidence and do not change coverage.
    </p>
  </section>
</template>
