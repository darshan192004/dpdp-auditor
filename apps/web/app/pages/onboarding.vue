<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ORG_NAME_MAX,
  ORG_NAME_MIN,
  OrgInputError,
  parseCreateOrg,
  slugify,
  type OrgDetail,
} from '~~/shared/org';
import { useAppContext } from '~/composables/useAppContext';

// Onboarding is a three-step wizard (design §3.2); this slice ships step 1.
definePageMeta({ layout: 'auth' });

const { user, org } = useAppContext();

const form = reactive({ name: '', slug: '' });
const slugEdited = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);

const slugPreview = computed(() => (slugEdited.value ? form.slug : slugify(form.name)));
const canSubmit = computed(() => form.name.trim().length >= ORG_NAME_MIN && !submitting.value);

watch(
  () => form.name,
  (name) => {
    if (!slugEdited.value) form.slug = slugify(name);
  },
);

async function createOrganisation(): Promise<void> {
  if (!canSubmit.value) return;
  error.value = null;

  let input: ReturnType<typeof parseCreateOrg>;
  try {
    input = parseCreateOrg({ name: form.name, slug: slugPreview.value });
  } catch (cause) {
    error.value = cause instanceof OrgInputError ? cause.message : 'Check the form and try again.';
    return;
  }

  submitting.value = true;
  try {
    const response = await $fetch<{ data: OrgDetail }>('/api/v1/org', {
      method: 'POST',
      body: input,
    });
    const created = response.data;
    org.value = {
      id: created.id,
      name: created.name,
      slug: created.slug,
      plan: created.plan,
      retentionDays: created.retentionDays,
      role: created.role,
    };
    await navigateTo('/app', { replace: true });
  } catch (cause) {
    const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
    error.value =
      typeof message === 'string' ? message : 'Could not create the organisation. Try again.';
  } finally {
    submitting.value = false;
  }
}

async function signOut(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  await navigateTo('/login', { replace: true });
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">
        Onboarding · Step 1 of 3
      </p>
      <h1 class="text-ink-900 text-2xl font-semibold tracking-tight">Create your organisation</h1>
      <p class="text-ink-600 text-sm leading-6">
        You are signed in<template v-if="user"> as {{ user.name ?? user.email }}</template
        >. Name the workspace your team will audit in. You can connect a repository next.
      </p>
    </div>

    <p
      v-if="error"
      role="alert"
      class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
    >
      {{ error }}
    </p>

    <form class="space-y-4" novalidate @submit.prevent="createOrganisation">
      <div>
        <label for="org-name" class="text-ink-700 mb-1 block text-xs font-medium">
          Organisation name
        </label>
        <input
          id="org-name"
          v-model="form.name"
          name="name"
          type="text"
          autocomplete="organization"
          :maxlength="ORG_NAME_MAX"
          :disabled="submitting"
          class="border-ink-200 text-ink-900 focus-visible:ring-brand-500 disabled:bg-ink-100 bg-surface w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      <div>
        <label for="org-slug" class="text-ink-700 mb-1 block text-xs font-medium">
          Workspace URL
        </label>
        <div
          class="border-ink-200 bg-surface focus-within:ring-brand-500 flex items-stretch overflow-hidden rounded-[var(--radius-control)] border focus-within:ring-2"
        >
          <span class="text-ink-500 bg-ink-50 border-ink-200 border-r px-3 py-2 font-mono text-xs">
            app/
          </span>
          <input
            id="org-slug"
            v-model="form.slug"
            name="slug"
            type="text"
            autocapitalize="none"
            spellcheck="false"
            :disabled="submitting"
            class="text-ink-900 placeholder:text-ink-400 min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-xs focus:outline-none"
            placeholder="acme-payments"
            @input="slugEdited = true"
          />
        </div>
        <p class="text-ink-500 mt-1 text-xs">
          3–40 lowercase letters, digits, or hyphens. This cannot be changed later.
        </p>
      </div>

      <button
        type="submit"
        :disabled="!canSubmit"
        class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex w-full items-center justify-center rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        {{ submitting ? 'Creating…' : 'Create organisation' }}
      </button>
    </form>

    <button
      type="button"
      class="bg-surface text-ink-700 ring-ink-200 hover:bg-ink-100 focus-visible:ring-brand-500 inline-flex w-full items-center justify-center rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium ring-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      @click="signOut"
    >
      Sign out
    </button>
  </div>
</template>
