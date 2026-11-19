<script setup lang="ts">
type State = 'ready' | 'partial' | 'at_risk';
defineProps<{
  sections: { code: string; title: string; state: State; controls: number }[];
}>();

const TONES: Record<State, string> = {
  ready: 'border-status-compliant-border text-status-compliant-text bg-status-compliant-bg',
  partial: 'border-status-partial-border text-status-partial-text bg-status-partial-bg',
  at_risk:
    'border-status-noncompliant-border text-status-noncompliant-text bg-status-noncompliant-bg',
};
const LABELS: Record<State, string> = { ready: 'READY', partial: 'PARTIAL', at_risk: 'AT RISK' };
</script>

<template>
  <section aria-labelledby="section-coverage-heading">
    <h2
      id="section-coverage-heading"
      class="text-ink-400 mb-3 font-mono text-xs tracking-widest uppercase"
    >
      DPDP section readiness
    </h2>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="section in sections"
        :key="section.code"
        :class="TONES[section.state]"
        class="rounded-[var(--radius-card)] border p-4"
      >
        <p class="font-mono text-xs">{{ section.code }}</p>
        <p class="text-ink-900 mt-2 text-sm font-medium">{{ section.title }}</p>
        <p class="mt-3 font-mono text-[11px]">{{ LABELS[section.state] }}</p>
        <p class="text-ink-400 mt-1 text-xs">{{ section.controls }} controls</p>
      </article>
    </div>
  </section>
</template>
