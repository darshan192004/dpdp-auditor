<script setup lang="ts">
import { useAppContext } from '~/composables/useAppContext';

// Signed-in user without an organisation. The create-organisation wizard lands
// in the next Phase 2 slice; this page stays honest until then.
definePageMeta({ layout: 'auth' });

const { user } = useAppContext();

async function signOut(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  await navigateTo('/login', { replace: true });
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Onboarding</p>
      <h1 class="text-ink-900 text-2xl font-semibold tracking-tight">Set up your organisation</h1>
      <p class="text-ink-600 text-sm leading-6">
        You are signed in<template v-if="user"> as {{ user.name ?? user.email }}</template
        >. Creating an organisation and connecting your first repository is the next step.
      </p>
    </div>

    <div class="bg-ink-50 rounded-[var(--radius-control)] px-3 py-2.5">
      <p class="text-ink-600 text-xs leading-5">
        Organisation setup is being enabled in the next release. Your GitHub account is already
        connected, so nothing is lost by signing out and returning later.
      </p>
    </div>

    <button
      type="button"
      class="bg-surface text-ink-700 ring-ink-200 hover:bg-ink-100 focus-visible:ring-brand-500 inline-flex w-full items-center justify-center rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium ring-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      @click="signOut"
    >
      Sign out
    </button>
  </div>
</template>
