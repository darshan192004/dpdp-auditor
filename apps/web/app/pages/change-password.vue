<script setup lang="ts">
import { ref } from 'vue';

import { passwordChangeError } from '~/utils/password-login';

definePageMeta({ layout: 'auth' });

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const formError = ref<string | null>(null);
const submitting = ref(false);

async function submit() {
  if (submitting.value) return;
  formError.value = passwordChangeError(newPassword.value, confirmPassword.value);
  if (formError.value !== null) return;

  submitting.value = true;
  try {
    await $fetch('/api/auth/password/change', {
      method: 'POST',
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      },
    });
    await navigateTo('/app', { replace: true });
  } catch {
    formError.value = 'Current password is incorrect.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Account</p>
      <h1 class="text-ink-900 text-2xl font-semibold tracking-tight">Set a new password</h1>
      <p class="text-ink-600 text-sm leading-6">
        Your assigned temporary password must be changed before you continue.
      </p>
    </div>

    <form class="space-y-3" @submit.prevent="submit">
      <label class="text-ink-700 block text-sm" for="current-password">Temporary password</label>
      <input
        id="current-password"
        v-model="currentPassword"
        type="password"
        required
        autocomplete="current-password"
        class="border-ink-200 w-full rounded-[var(--radius-control)] border px-3 py-2"
      />
      <label class="text-ink-700 block text-sm" for="new-password">New password</label>
      <input
        id="new-password"
        v-model="newPassword"
        type="password"
        required
        minlength="12"
        autocomplete="new-password"
        class="border-ink-200 w-full rounded-[var(--radius-control)] border px-3 py-2"
      />
      <label class="text-ink-700 block text-sm" for="confirm-password">Confirm new password</label>
      <input
        id="confirm-password"
        v-model="confirmPassword"
        type="password"
        required
        minlength="12"
        autocomplete="new-password"
        class="border-ink-200 w-full rounded-[var(--radius-control)] border px-3 py-2"
      />
      <p v-if="formError" role="alert" class="text-risk-critical-text text-sm">{{ formError }}</p>
      <button
        type="submit"
        :disabled="submitting"
        class="bg-brand-500 text-ink-50 w-full rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {{ submitting ? 'Saving…' : 'Save new password' }}
      </button>
    </form>
  </div>
</template>
