<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AcceptInviteResult } from '~~/shared/invite';

definePageMeta({ layout: 'default' });

const route = useRoute();
const token = computed(() => route.params.token as string);
const pending = ref(false);
const error = ref<string | null>(null);
const result = ref<AcceptInviteResult | null>(null);

async function acceptInvite(): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  error.value = null;
  try {
    const response = await $fetch<{ data: AcceptInviteResult }>(
      `/api/v1/invites/${encodeURIComponent(token.value)}/accept`,
      { method: 'POST' },
    );
    result.value = response.data;
    // Redirect to the org after a short delay
    setTimeout(() => {
      navigateTo('/app');
    }, 2000);
  } catch (cause) {
    const message = (cause as { data?: { error?: { message?: unknown } } }).data?.error?.message;
    error.value = typeof message === 'string' ? message : 'Could not accept the invitation.';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4 py-12">
    <div class="w-full max-w-md space-y-4">
      <div class="text-center">
        <h1 class="text-ink-900 text-2xl font-bold">Team invitation</h1>
        <p class="text-ink-600 mt-2 text-sm">You've been invited to join an organisation.</p>
      </div>

      <div
        v-if="result"
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div
          class="bg-status-compliant-bg text-status-compliant-text border-status-compliant-solid border-b px-4 py-3"
        >
          <p class="text-sm font-medium">Invitation accepted!</p>
        </div>
        <div class="px-4 py-4 text-center">
          <p class="text-ink-700 text-sm">
            You are now a member of the organisation. Redirecting you to the dashboard…
          </p>
        </div>
      </div>

      <div
        v-else
        class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
      >
        <div class="border-ink-200 border-b px-4 py-3">
          <h2 class="text-ink-900 text-sm font-semibold">Accept invitation</h2>
        </div>

        <div class="space-y-4 px-4 py-4">
          <p
            v-if="error"
            role="alert"
            class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
          >
            {{ error }}
          </p>

          <p class="text-ink-700 text-sm">
            Click the button below to accept the invitation and join the team.
          </p>

          <button
            type="button"
            :disabled="pending"
            class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 w-full rounded-[var(--radius-control)] px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            @click="acceptInvite"
          >
            {{ pending ? 'Accepting…' : 'Accept invitation' }}
          </button>

          <p class="text-ink-500 text-center text-xs">
            This invitation was sent to the email address associated with your account.
          </p>
        </div>
      </div>

      <div class="text-center">
        <NuxtLink
          to="/app"
          class="text-brand-600 hover:text-brand-700 text-sm font-medium focus-visible:underline focus-visible:outline-none"
        >
          Return to dashboard
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
