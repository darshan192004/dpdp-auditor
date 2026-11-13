<script setup lang="ts">
import { computed } from 'vue';

import RuleCard from '~/components/rules/RuleCard.vue';
import SectionNav from '~/components/rules/SectionNav.vue';
import PageHeader from '~/components/shell/PageHeader.vue';
import AppIcon from '~/components/ui/AppIcon.vue';
import ErrorState from '~/components/ui/ErrorState.vue';
import { FINDING_SCANNERS, type FindingScanner } from '~~/shared/findings';
import {
  filterRules,
  hasActiveRulesFilters,
  parseRulesQuery,
  ruleScannerCounts,
  ruleSections,
  rulesUrl,
  SCANNER_LABELS,
  type RulesPage,
} from '~~/shared/rules';

definePageMeta({ layout: 'app' });

const route = useRoute();
const router = useRouter();

const query = computed(() => parseRulesQuery(route.query as Record<string, unknown>));

// One unfiltered page: the catalog is small, and filtering here keeps the
// section counts exact while the URL still carries the shareable state.
const { data, status, error, refresh } = await useFetch<RulesPage>('/api/v1/rules');

const allRules = computed(() => data.value?.data ?? []);
const sections = computed(() => ruleSections(allRules.value));
const scannerCounts = computed(() => ruleScannerCounts(allRules.value));
const rules = computed(() => filterRules(allRules.value, query.value));
const filtered = computed(() => hasActiveRulesFilters(query.value));
const loading = computed(() => status.value === 'pending');

const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    statusMessage?: string;
    data?: { error?: { message?: string; requestId?: string } };
  };
  return {
    message: failure.data?.error?.message ?? 'The rule catalog could not be loaded.',
    requestId: failure.data?.error?.requestId,
  };
});

async function setScanner(scanner: FindingScanner): Promise<void> {
  const next = query.value.scanner === scanner ? null : scanner;
  await router.replace(rulesUrl({ ...query.value, scanner: next }));
}

async function clearFilters(): Promise<void> {
  await router.replace('/app/rules');
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Rules" :breadcrumbs="[{ label: 'Rules' }]">
      <template #actions>
        <p class="text-ink-500 text-xs tabular-nums" role="status" aria-live="polite">
          {{ rules.length }} of {{ allRules.length }} controls
        </p>
      </template>
    </PageHeader>

    <ErrorState
      v-if="loadError"
      :message="loadError.message"
      :request-id="loadError.requestId ?? null"
      @retry="refresh"
    />

    <div v-else class="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div class="lg:sticky lg:top-20 lg:self-start">
        <SectionNav :sections="sections" :active="query.section" :scanner="query.scanner" />
      </div>

      <div class="min-w-0 space-y-4">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <fieldset class="flex flex-wrap items-center gap-1.5">
            <legend class="text-ink-500 float-left mr-1 text-xs">Scanner</legend>
            <button
              v-for="scanner in FINDING_SCANNERS"
              :key="scanner"
              type="button"
              :aria-pressed="query.scanner === scanner"
              class="focus-visible:ring-brand-500 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              :class="
                query.scanner === scanner
                  ? 'border-brand-500 bg-brand-500 text-ink-50'
                  : 'text-ink-600 hover:bg-ink-100 bg-surface'
              "
              @click="setScanner(scanner)"
            >
              {{ SCANNER_LABELS[scanner] }}
              <span class="tabular-nums opacity-70">{{ scannerCounts[scanner] }}</span>
            </button>
          </fieldset>

          <button
            v-if="filtered"
            type="button"
            class="text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 bg-surface ml-auto inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
            @click="clearFilters"
          >
            <AppIcon name="x" :size="12" />
            Clear filters
          </button>
        </div>

        <p v-if="loading" class="text-ink-500 text-sm">Loading the control catalog…</p>

        <div
          v-else-if="rules.length === 0"
          class="bg-surface rounded-[var(--radius-card)] px-6 py-10 text-center shadow-[var(--shadow-card)]"
        >
          <p class="text-ink-800 text-sm font-medium">No controls match these filters.</p>
          <p class="text-ink-500 mt-1 text-sm">
            Every control is scored from scanner evidence, so a scanner filter hides controls with
            no mapping for it.
          </p>
          <button
            type="button"
            class="text-ink-700 hover:bg-ink-100 focus-visible:ring-brand-500 bg-ink-100 mt-3 rounded-[var(--radius-control)] px-3 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
            @click="clearFilters"
          >
            Show all controls
          </button>
        </div>

        <ul v-else class="space-y-2">
          <li v-for="rule in rules" :key="rule.code">
            <RuleCard :rule="rule" />
          </li>
        </ul>

        <p class="text-ink-500 text-xs">
          Controls are engineering checks, not legal advice. Section 12 is not assessed by code.
        </p>
      </div>
    </div>
  </div>
</template>
