<script setup lang="ts">
import { computed } from 'vue';

definePageMeta({ layout: 'auth' });

const route = useRoute();

const redirect = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/app',
);

const signInHref = computed(
  () => `/api/auth/github?redirect=${encodeURIComponent(redirect.value)}`,
);

const errorMessage = computed(() => {
  switch (route.query.error) {
    case 'oauth_state':
      return 'That sign-in link expired or was already used. Please start again.';
    case 'oauth_failed':
      return 'GitHub sign-in did not complete. Please try again.';
    default:
      return null;
  }
});
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-2">
      <p class="text-ink-400 font-mono text-xs tracking-widest uppercase">Account</p>
      <h1 class="text-ink-900 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p class="text-ink-600 text-sm leading-6">
        Continue to your compliance workspace. We use GitHub to confirm who you are.
      </p>
    </div>

    <p
      v-if="errorMessage"
      role="alert"
      class="bg-risk-critical-bg text-risk-critical-text rounded-[var(--radius-control)] px-3 py-2 text-sm"
    >
      {{ errorMessage }}
    </p>

    <a
      :href="signInHref"
      rel="nofollow"
      class="bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-500 text-ink-50 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" class="h-4 w-4" aria-hidden="true">
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
        />
      </svg>
      Sign in with GitHub
    </a>

    <p class="text-ink-500 text-xs leading-5">
      We request your public profile and verified email only (<code class="font-mono"
        >read:user user:email</code
      >). No repository access.
    </p>
  </div>
</template>
