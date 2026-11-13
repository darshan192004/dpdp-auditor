<script setup lang="ts">
import { computed, ref } from 'vue';

import { FINDING_STATUSES, type FindingStatus } from '~~/shared/findings';
import { noteMinimumFor, validateTriage, type TriageErrors } from '~~/shared/triage';

const props = withDefaults(
  defineProps<{
    currentStatus: FindingStatus;
    canTriage: boolean;
    submitting?: boolean;
  }>(),
  { submitting: false },
);

const emit = defineEmits<{
  submit: [draft: { status: FindingStatus; note?: string; externalUrl?: string }];
}>();

const LABELS: Record<FindingStatus, string> = {
  open: 'Reopen',
  false_positive: 'Mark false positive',
  accepted_risk: 'Accept risk',
  fixed: 'Mark fixed',
  reopened: 'Reopen',
};

const status = ref<FindingStatus>(props.currentStatus);
const note = ref('');
const externalUrl = ref('');
const errors = ref<TriageErrors>({});

const minimum = computed(() => noteMinimumFor(status.value));
const help = computed(() =>
  minimum.value > 0
    ? `A note of at least ${minimum.value} characters is required for this disposition.`
    : 'Optional context for the audit trail.',
);
const noteDescribedBy = computed(() =>
  errors.value.note ? 'triage-note-help triage-note-error' : 'triage-note-help',
);

function onSubmit(): void {
  if (!props.canTriage || props.submitting) return;

  const next = validateTriage({
    status: status.value,
    note: note.value,
    externalUrl: externalUrl.value,
  });
  errors.value = next;
  if (Object.keys(next).length > 0) return;

  const trimmedNote = note.value.trim();
  const trimmedUrl = externalUrl.value.trim();

  emit('submit', {
    status: status.value,
    ...(trimmedNote === '' ? {} : { note: trimmedNote }),
    ...(trimmedUrl === '' ? {} : { externalUrl: trimmedUrl }),
  });
}
</script>

<template>
  <form class="space-y-3" novalidate @submit.prevent="onSubmit">
    <div>
      <label for="triage-status" class="text-ink-700 mb-1 block text-xs font-medium">
        Disposition
      </label>
      <select
        id="triage-status"
        v-model="status"
        name="status"
        class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        :disabled="!canTriage || submitting"
      >
        <option v-for="option in FINDING_STATUSES" :key="option" :value="option">
          {{ LABELS[option] }}
        </option>
      </select>
    </div>

    <div>
      <label for="triage-note" class="text-ink-700 mb-1 block text-xs font-medium"> Note </label>
      <textarea
        id="triage-note"
        v-model="note"
        name="note"
        rows="3"
        :aria-describedby="noteDescribedBy"
        :aria-invalid="errors.note ? 'true' : undefined"
        :disabled="!canTriage || submitting"
        class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-2 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <p id="triage-note-help" class="text-ink-500 mt-1 text-xs">{{ help }}</p>
      <p
        v-if="errors.note"
        id="triage-note-error"
        role="alert"
        class="text-risk-critical-text mt-1 text-xs"
      >
        {{ errors.note }}
      </p>
    </div>

    <div>
      <label for="triage-external-url" class="text-ink-700 mb-1 block text-xs font-medium">
        Ticket link <span class="text-ink-500 font-normal">(optional, HTTPS)</span>
      </label>
      <input
        id="triage-external-url"
        v-model="externalUrl"
        name="externalUrl"
        type="url"
        inputmode="url"
        :aria-invalid="errors.externalUrl ? 'true' : undefined"
        :disabled="!canTriage || submitting"
        class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-2 py-1.5 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
      />
      <p v-if="errors.externalUrl" role="alert" class="text-risk-critical-text mt-1 text-xs">
        {{ errors.externalUrl }}
      </p>
    </div>

    <p v-if="!canTriage" class="text-ink-500 text-xs">
      Your role can review findings but not change them.
    </p>

    <button
      type="submit"
      :disabled="!canTriage || submitting"
      class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center justify-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      {{ submitting ? 'Saving…' : 'Save disposition' }}
    </button>
  </form>
</template>
