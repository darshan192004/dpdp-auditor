<script setup lang="ts">
import { computed, ref } from 'vue';

import type { FindingStatus, FindingView } from '~~/shared/findings';
import AppIcon from '../ui/AppIcon.vue';
import ConfidenceBadge from './ConfidenceBadge.vue';
import ScannerLabel from './ScannerLabel.vue';
import SeverityBadge from './SeverityBadge.vue';
import StatusBadge from './StatusBadge.vue';
import TriageForm from './TriageForm.vue';

const props = withDefaults(
  defineProps<{
    finding: FindingView;
    role: string;
    submitting?: boolean;
  }>(),
  { submitting: false },
);

const emit = defineEmits<{
  triage: [draft: { status: FindingStatus; note?: string; externalUrl?: string }];
}>();

const canTriage = computed(() => ['owner', 'admin', 'auditor'].includes(props.role));
const hashPrefix = computed(() => `${props.finding.evidence.hash.slice(0, 20)}…`);
const copied = ref(false);

async function copyFix(): Promise<void> {
  const text = props.finding.remediation?.summary;
  if (!text || !navigator.clipboard) return;
  await navigator.clipboard.writeText(text);
  copied.value = true;
}
</script>

<template>
  <article aria-labelledby="finding-title" class="space-y-6 px-5 py-5">
    <header class="space-y-2">
      <h2 id="finding-title" tabindex="-1" class="text-ink-900 text-lg font-semibold">
        {{ finding.message }}
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <SeverityBadge :severity="finding.severity" />
        <StatusBadge :status="finding.status" />
        <ConfidenceBadge :confidence="finding.confidence" />
        <ScannerLabel :scanner="finding.scanner" />
      </div>
    </header>

    <dl class="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-ink-500">Control</dt>
      <dd class="text-ink-900 font-mono text-xs">
        {{ finding.dpdpa?.code ?? 'Unmapped' }}
      </dd>

      <dt class="text-ink-500">Section</dt>
      <dd class="text-ink-800">
        {{ finding.dpdpa ? `${finding.dpdpa.section} · ${finding.dpdpa.title}` : 'Not mapped' }}
      </dd>

      <dt class="text-ink-500">Location</dt>
      <dd class="text-ink-800 font-mono text-xs">
        {{ finding.filePath }}:{{ finding.lineStart }}–{{ finding.lineEnd }}
      </dd>

      <dt class="text-ink-500">Rule</dt>
      <dd class="text-ink-800 font-mono text-xs break-all">{{ finding.scannerRuleId }}</dd>
    </dl>

    <section v-if="finding.dpdpa" aria-labelledby="finding-why-heading" class="space-y-2">
      <h3 id="finding-why-heading" class="text-ink-900 text-sm font-semibold">Why this matters</h3>
      <p class="text-ink-700 text-sm">{{ finding.dpdpa.rationale }}</p>
      <p class="text-ink-500 text-xs">
        DPDPA §{{ finding.dpdpa.section }}. This is an engineering signal, not legal advice.
      </p>
    </section>

    <section aria-labelledby="finding-evidence-heading" class="space-y-2">
      <h3 id="finding-evidence-heading" class="text-ink-900 text-sm font-semibold">Evidence</h3>
      <pre
        v-if="finding.evidence.redacted"
        class="border-ink-200 bg-ink-50 text-ink-800 overflow-x-auto rounded-[var(--radius-control)] border px-3 py-2 font-mono text-xs whitespace-pre-wrap"
        >{{ finding.evidence.redacted }}</pre>
      <p
        v-else
        class="border-ink-200 bg-ink-50 text-ink-700 rounded-[var(--radius-control)] border px-3 py-2 text-sm"
      >
        <AppIcon name="lock" :size="14" class="text-ink-400 mr-1 inline align-[-2px]" />
        Value withheld for security.
        <span class="text-ink-500 font-mono text-xs">{{ hashPrefix }}</span>
      </p>
    </section>

    <section v-if="finding.remediation" aria-labelledby="finding-fix-heading" class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <h3 id="finding-fix-heading" class="text-ink-900 text-sm font-semibold">Remediation</h3>
        <button
          type="button"
          class="border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex items-center gap-1 rounded-[var(--radius-control)] border bg-white px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
          @click="copyFix"
        >
          <AppIcon name="copy" :size="12" />
          {{ copied ? 'Copied' : 'Copy fix' }}
        </button>
      </div>
      <p class="text-ink-800 text-sm">{{ finding.remediation.summary }}</p>
      <ol class="text-ink-700 list-decimal space-y-1 pl-5 text-sm">
        <li v-for="step in finding.remediation.steps" :key="step">{{ step }}</li>
      </ol>
      <p role="status" class="sr-only">
        {{ copied ? 'Remediation summary copied to the clipboard.' : '' }}
      </p>
    </section>

    <section aria-labelledby="finding-actions-heading" class="space-y-2">
      <h3 id="finding-actions-heading" class="text-ink-900 text-sm font-semibold">Actions</h3>
      <TriageForm
        :current-status="finding.status"
        :can-triage="canTriage"
        :submitting="submitting"
        @submit="emit('triage', $event)"
      />
    </section>
  </article>
</template>
