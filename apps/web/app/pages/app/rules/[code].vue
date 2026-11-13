<script setup lang="ts">
import { computed } from 'vue';

import RuleMappingTable from '~/components/rules/RuleMappingTable.vue';
import PageHeader from '~/components/shell/PageHeader.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import AppIcon from '~/components/ui/AppIcon.vue';
import ConfidenceBadge from '~/components/findings/ConfidenceBadge.vue';
import SeverityBadge from '~/components/findings/SeverityBadge.vue';
import { ruleSectionLabel, ruleWeightLabel, type RuleView } from '~~/shared/rules';

definePageMeta({ layout: 'app' });

const route = useRoute();
const code = computed(() => String(route.params.code));

const { data, status, error, refresh } = await useFetch<{ data: RuleView }>(
  () => `/api/v1/rules/${encodeURIComponent(code.value)}`,
);

const rule = computed<RuleView | null>(() => data.value?.data ?? null);
const loading = computed(() => status.value === 'pending');
const isMissing = computed(
  () => error.value !== null && (error.value as { statusCode?: number }).statusCode === 404,
);

const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    statusMessage?: string;
    statusCode?: number;
    data?: { error?: { message?: string; requestId?: string } };
  };
  return {
    message: failure.data?.error?.message ?? 'The control could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      :title="rule?.title ?? (loading ? 'Loading control…' : 'Control')"
      :breadcrumbs="[{ label: 'Rules', to: '/app/rules' }, { label: code }]"
    >
      <template #actions>
        <SeverityBadge v-if="rule !== null" :severity="rule.severity" />
      </template>
    </PageHeader>

    <ErrorState
      v-if="loadError"
      :message="isMissing ? 'This control is not in the catalog.' : loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <div v-else-if="rule !== null" class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div class="min-w-0 space-y-5">
        <section
          aria-labelledby="obligation-heading"
          class="border-ink-200 bg-surface rounded-[var(--radius-card)] border px-4 py-4"
        >
          <h2
            id="obligation-heading"
            class="text-ink-500 text-xs font-medium tracking-wide uppercase"
          >
            What the law asks
          </h2>
          <p class="text-ink-800 mt-2 text-sm leading-relaxed">{{ rule.obligation }}</p>
          <p class="text-ink-600 mt-2 text-sm leading-relaxed">{{ rule.summary }}</p>
        </section>

        <section aria-labelledby="mappings-heading" class="space-y-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="mappings-heading" class="text-ink-900 text-sm font-semibold">
              Scanner evidence
            </h2>
            <p class="text-ink-500 text-xs tabular-nums">
              {{ rule.mappings.length }}
              {{ rule.mappings.length === 1 ? 'mapping' : 'mappings' }}
            </p>
          </div>
          <RuleMappingTable :mappings="rule.mappings" />
        </section>

        <section
          aria-labelledby="remediation-heading"
          class="border-ink-200 bg-surface rounded-[var(--radius-card)] border px-4 py-4"
        >
          <h2
            id="remediation-heading"
            class="text-ink-900 flex items-center gap-1.5 text-sm font-semibold"
          >
            <AppIcon name="lightbulb" :size="15" class="text-ink-400" />
            How to fix it
          </h2>
          <p class="text-ink-700 mt-2 text-sm leading-relaxed">{{ rule.remediation }}</p>
        </section>
      </div>

      <aside aria-label="Control metadata" class="space-y-3">
        <dl
          class="border-ink-200 divide-ink-100 bg-surface divide-y rounded-[var(--radius-card)] border text-sm"
        >
          <div class="px-4 py-2.5">
            <dt class="text-ink-500 text-xs">Control code</dt>
            <dd class="text-ink-900 mt-0.5 font-mono text-xs">{{ rule.code }}</dd>
          </div>
          <div class="px-4 py-2.5">
            <dt class="text-ink-500 text-xs">Section</dt>
            <dd class="text-ink-800 mt-0.5">
              <span class="font-mono text-xs">{{ rule.section }}</span>
              <span class="text-ink-500"> · </span>
              {{ ruleSectionLabel(rule.section) }}
            </dd>
          </div>
          <div class="px-4 py-2.5">
            <dt class="text-ink-500 text-xs">Legal reference</dt>
            <dd class="text-ink-800 mt-0.5">{{ rule.legalReference }}</dd>
          </div>
          <div class="px-4 py-2.5">
            <dt class="text-ink-500 text-xs">Score weight</dt>
            <dd class="text-ink-800 mt-0.5 tabular-nums">{{ ruleWeightLabel(rule) }}</dd>
          </div>
          <div class="px-4 py-2.5">
            <dt class="text-ink-500 text-xs">Evidence strength</dt>
            <dd class="mt-1">
              <ConfidenceBadge :confidence="rule.evidenceStrength" />
            </dd>
          </div>
          <div v-if="rule.tags.length > 0" class="px-4 py-2.5">
            <dt class="text-ink-500 text-xs">Tags</dt>
            <dd class="mt-1.5 flex flex-wrap gap-1">
              <span
                v-for="tag in rule.tags"
                :key="tag"
                class="border-ink-200 text-ink-600 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs"
              >
                {{ tag }}
              </span>
            </dd>
          </div>
        </dl>

        <p
          v-if="!rule.scored"
          class="border-ink-200 bg-ink-100 text-ink-600 rounded-[var(--radius-card)] border px-4 py-3 text-xs"
        >
          This control is listed for completeness but does not move the score.
        </p>
      </aside>
    </div>
  </div>
</template>
