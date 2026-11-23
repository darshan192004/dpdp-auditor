<script setup lang="ts">
import { computed } from 'vue';

import NewRules from '~/components/new/NewRules.vue';
import type { RulesPage } from '~~/shared/rules';

const route = useRoute();
const { data, status, error } = await useFetch<RulesPage>('/api/v1/rules');

const rules = computed(() => data.value?.data ?? []);
const loading = computed(() => status.value === 'pending');
const loadError = computed(() => {
  if (!error.value) return null;
  const failure = error.value as {
    data?: { error?: { message?: string; requestId?: string } };
  };
  const message = failure.data?.error?.message ?? 'The controls could not be loaded.';
  const requestId = failure.data?.error?.requestId;
  return requestId ? `${message} (request ${requestId})` : message;
});
const section = computed(() => {
  const value = route.query.section;
  return typeof value === 'string' && value !== '' ? value : null;
});
</script>

<template>
  <NewRules :rules="rules" :section="section" :loading="loading" :error="loadError" />
</template>
