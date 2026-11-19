<script setup lang="ts">
import { computed } from 'vue';

import NewRules from '~/components/new/NewRules.vue';
import type { RulesPage } from '~~/shared/rules';

const { data, status, error } = await useFetch<RulesPage>('/api/v1/rules');

const rules = computed(() => data.value?.data ?? []);
const loading = computed(() => status.value === 'pending');
const loadError = computed(() => {
  const failure = error.value as { data?: { error?: { message?: string } } } | null;
  return failure?.data?.error?.message ?? null;
});
</script>

<template>
  <NewRules
    :rules="rules.map((rule) => ({ code: rule.code, title: rule.title }))"
    :loading="loading"
    :error="loadError"
  />
</template>
