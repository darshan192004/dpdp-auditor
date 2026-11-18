<script setup lang="ts">
import { computed, ref } from 'vue';

import DsBadge from '~/components/ds/DsBadge.vue';
import DsButton from '~/components/ds/DsButton.vue';
import DsCard from '~/components/ds/DsCard.vue';
import DsDrawer from '~/components/ds/DsDrawer.vue';
import DsInput from '~/components/ds/DsInput.vue';
import { useToasts } from '~/composables/useToasts';
import type { FindingStatus, FindingView } from '~~/shared/findings';

const props = defineProps<{ findings: FindingView[] }>();
const emit = defineEmits<{ triaged: [] }>();

const STATUS_OPTIONS: FindingStatus[] = [
  'open',
  'false_positive',
  'accepted_risk',
  'fixed',
  'reopened',
];
const selected = ref<FindingView | null>(null);
const status = ref<FindingStatus>('open');
const note = ref('');
const pending = ref(false);
const { push } = useToasts();

const openCount = computed(
  () => props.findings.filter((finding) => finding.status === 'open').length,
);

function select(finding: FindingView): void {
  selected.value = finding;
  status.value = finding.status;
  note.value = '';
}

async function save(): Promise<void> {
  if (selected.value === null) return;
  const id = selected.value.id;
  pending.value = true;
  try {
    await $fetch(`/api/v1/findings/${id}`, {
      method: 'PATCH',
      body: {
        status: status.value,
        ...(note.value.trim() === '' ? {} : { note: note.value.trim() }),
      },
    });
    push('success', 'Finding triaged', `${id} → ${status.value}`);
    selected.value = null;
    emit('triaged');
  } catch (cause) {
    const message = (cause as { data?: { error?: { message?: string } } }).data?.error?.message;
    push('error', 'Triage failed', message ?? 'The disposition could not be saved.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Remediation workspace</h1>
    <p class="text-ink-400 mt-2 font-mono text-xs">{{ openCount }} open · status-only triage</p>
    <div class="mt-6 grid gap-2">
      <DsCard v-for="finding in findings" :key="finding.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 text-left"
          @click="select(finding)"
        >
          <DsBadge :tone="finding.severity">{{ finding.severity }}</DsBadge>
          <span class="text-ink-900 flex-1 text-sm">{{ finding.message }}</span>
          <span class="text-ink-400 font-mono text-xs">{{ finding.status }}</span>
        </button>
      </DsCard>
      <p v-if="findings.length === 0" class="text-ink-400 text-sm">No findings to triage.</p>
    </div>
    <DsDrawer :open="selected !== null" :title="selected?.message ?? ''" @close="selected = null">
      <template v-if="selected">
        <p class="text-ink-400 font-mono text-xs">
          {{ selected.filePath }}:{{ selected.lineStart }} · {{ selected.evidence.hash }}
        </p>
        <p class="mt-4 text-sm">{{ selected.remediation?.summary ?? 'Review this finding.' }}</p>
        <ol
          v-if="selected.remediation?.steps.length"
          class="text-ink-400 mt-3 list-decimal pl-5 text-sm"
        >
          <li v-for="step in selected.remediation.steps" :key="step">{{ step }}</li>
        </ol>
        <label class="mt-6 block">
          <span class="text-ink-400 font-mono text-xs uppercase">Status</span>
          <select
            v-model="status"
            class="bg-surface-raised text-ink-900 border-ink-300 mt-2 w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm"
          >
            <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <DsInput v-model="note" label="Triage note" class="mt-4" />
        <DsButton class="mt-6" :disabled="pending" @click="save">
          {{ pending ? 'Saving…' : 'Save disposition' }}
        </DsButton>
      </template>
    </DsDrawer>
  </div>
</template>
