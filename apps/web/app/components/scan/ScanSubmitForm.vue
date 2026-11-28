<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';

import type { SavedRepoView } from '~~/shared/repo';
import {
  createIdempotencyKey,
  quotaExhausted,
  validateScanSubmit,
  ScanInputError,
  type ScanProfile,
  type ScanSubmitInput,
  type ScanQuota,
} from '~~/shared/scan';

/**
 * Start a scan (docs/design.md §5.5). The form mirrors the server's validation
 * so an obvious mistake never leaves the browser, and one idempotency key is
 * minted per rendered intent and reused across retries (api.md §1.7).
 */
const props = withDefaults(
  defineProps<{
    repos: SavedRepoView[];
    quota?: ScanQuota | null;
    canSubmit?: boolean;
    submitRequest?:
      ((payload: ScanSubmitInput & { idempotencyKey: string }) => Promise<void>) | null;
  }>(),
  { quota: null, canSubmit: true, submitRequest: null },
);

const emit = defineEmits<{
  submit: [
    payload: {
      repositoryId?: string;
      githubUrl?: string;
      ref?: string;
      profile: ScanProfile;
      idempotencyKey: string;
    },
  ];
}>();

const PROFILES: ReadonlyArray<{ value: ScanProfile; label: string; hint: string }> = [
  { value: 'standard', label: 'Standard', hint: 'Every scanner' },
  { value: 'secrets-only', label: 'Secrets only', hint: 'Gitleaks only' },
];
const form = reactive({
  repositoryId: '',
  githubUrl: '',
  ref: '',
  profile: 'standard' as ScanProfile,
});
const errors = reactive<{
  source?: string | undefined;
  githubUrl?: string | undefined;
  ref?: string | undefined;
  page?: string | undefined;
}>({});
const urlInput = ref<HTMLInputElement | null>(null);
const refInput = ref<HTMLInputElement | null>(null);
const idempotencyKey = createIdempotencyKey();

const exhausted = computed(() => quotaExhausted(props.quota));
const submitting = ref(false);
const disabled = computed(() => exhausted.value || !props.canSubmit || submitting.value);
const quotaLabel = computed(() => {
  if (props.quota === null) return null;
  return props.quota.limit > 0
    ? `${props.quota.used} of ${props.quota.limit} scans used this month`
    : `${props.quota.used} scans used this month`;
});

const selectedRepo = computed(
  () => props.repos.find((repo) => repo.id === form.repositoryId) ?? null,
);

const urlDescribedBy = computed(() =>
  [
    'scan-url-help',
    errors.githubUrl ? 'scan-url-error' : null,
    errors.source ? 'scan-source-error' : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' '),
);
const repoDescribedBy = computed(() => (errors.source ? 'scan-source-error' : undefined));
const refDescribedBy = computed(() => (errors.ref ? 'scan-ref-error' : undefined));

watch(selectedRepo, (repo) => {
  form.ref = repo?.defaultBranch ?? '';
  if (repo !== null) form.githubUrl = '';
});

watch(
  () => form.githubUrl,
  (value) => {
    errors.githubUrl = undefined;
    if (value.trim() !== '' || form.repositoryId !== '') errors.source = undefined;
    if (value.trim() !== '') form.repositoryId = '';
  },
);

watch(
  () => form.repositoryId,
  (value) => {
    if (value !== '' || form.githubUrl.trim() !== '') errors.source = undefined;
  },
);

watch(
  () => form.ref,
  () => {
    errors.ref = undefined;
  },
);

function clearErrors(): void {
  errors.source = undefined;
  errors.githubUrl = undefined;
  errors.ref = undefined;
  errors.page = undefined;
}

async function submit(): Promise<void> {
  if (disabled.value) return;
  clearErrors();
  submitting.value = true;
  const raw =
    form.repositoryId === ''
      ? { githubUrl: form.githubUrl, ref: form.ref, profile: form.profile }
      : { repositoryId: form.repositoryId, ref: form.ref, profile: form.profile };

  try {
    const input = validateScanSubmit(raw);
    const payload = { ...input, idempotencyKey };
    if (props.submitRequest) await props.submitRequest(payload);
    else emit('submit', payload);
  } catch (cause) {
    if (cause instanceof ScanInputError) {
      if (cause.message === 'Provide exactly one of repositoryId or githubUrl.') {
        errors.source = 'Choose a saved repository or paste a GitHub URL to start a scan.';
      } else if (cause.path === 'githubUrl') {
        errors.githubUrl =
          'Enter a full GitHub repository URL, such as https://github.com/acme/payments-service.';
      } else if (cause.path === 'ref') {
        errors.ref = cause.message;
      } else {
        errors.page = cause.message;
      }
    } else {
      errors.page = cause instanceof Error ? cause.message : 'The scan could not be started.';
    }

    await nextTick();
    if (errors.source || errors.githubUrl) urlInput.value?.focus();
    else if (errors.ref) refInput.value?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section
    aria-label="Scan submission"
    class="bg-surface rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-ink-500 text-xs">
          Scans read the default branch. No repository credentials are stored.
        </p>
      </div>
      <p v-if="quotaLabel" class="text-ink-500 text-xs tabular-nums">
        {{ quotaLabel }}
        <a
          v-if="exhausted"
          href="/app/settings/org"
          class="text-brand-700 focus-visible:ring-brand-500 rounded-[var(--radius-control)] font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Review scan limits
        </a>
      </p>
    </div>

    <form class="mt-4 space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label for="scan-url" class="text-ink-700 mb-1 block text-xs font-medium">
          GitHub repository URL
        </label>
        <input
          id="scan-url"
          ref="urlInput"
          v-model="form.githubUrl"
          name="githubUrl"
          type="url"
          inputmode="url"
          autocomplete="off"
          placeholder="https://github.com/acme/payments-service"
          :aria-describedby="urlDescribedBy"
          :aria-invalid="errors.source || errors.githubUrl ? 'true' : undefined"
          class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <p id="scan-url-help" class="text-ink-500 mt-1 text-xs">Public GitHub repositories only.</p>
        <p
          v-if="errors.githubUrl"
          id="scan-url-error"
          role="alert"
          class="text-risk-critical-text mt-1 text-xs"
        >
          {{ errors.githubUrl }}
        </p>
      </div>

      <div>
        <label for="scan-repo" class="text-ink-700 mb-1 block text-xs font-medium">
          Or pick a saved repository
        </label>
        <select
          id="scan-repo"
          v-model="form.repositoryId"
          name="repositoryId"
          :aria-describedby="repoDescribedBy"
          :aria-invalid="errors.source ? 'true' : undefined"
          class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          <option value="">Paste a URL instead</option>
          <option v-for="repo in repos" :key="repo.id" :value="repo.id">
            {{ repo.fullName }}
          </option>
        </select>
        <p
          v-if="errors.source"
          id="scan-source-error"
          role="alert"
          class="text-risk-critical-text mt-1 text-xs"
        >
          {{ errors.source }}
        </p>
      </div>

      <div>
        <label for="scan-ref" class="text-ink-700 mb-1 block text-xs font-medium">
          Branch, tag, or commit
        </label>
        <input
          id="scan-ref"
          ref="refInput"
          v-model="form.ref"
          name="ref"
          type="text"
          autocomplete="off"
          :placeholder="selectedRepo?.defaultBranch ?? 'Default branch'"
          :aria-describedby="refDescribedBy"
          :aria-invalid="errors.ref ? 'true' : undefined"
          class="border-ink-200 text-ink-900 placeholder:text-ink-400 focus-visible:ring-brand-500 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <p
          v-if="errors.ref"
          id="scan-ref-error"
          role="alert"
          class="text-risk-critical-text mt-1 text-xs"
        >
          {{ errors.ref }}
        </p>
      </div>

      <fieldset>
        <legend class="text-ink-700 mb-1 text-xs font-medium">Profile</legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in PROFILES"
            :key="option.value"
            :title="option.hint"
            class="border-ink-200 bg-surface-raised has-[:checked]:border-brand-500 has-[:checked]:text-ink-900 text-ink-600 inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
          >
            <input
              v-model="form.profile"
              type="radio"
              name="profile"
              :value="option.value"
              class="accent-brand-500"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>

      <p
        v-if="errors.page"
        role="alert"
        class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
      >
        {{ errors.page }}
      </p>

      <button
        type="submit"
        :disabled="disabled"
        class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex items-center rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start scan
      </button>
    </form>
  </section>
</template>
