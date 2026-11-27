<script setup lang="ts">
import ReadinessAttestationList from '~/components/readiness/ReadinessAttestationList.vue';
import { useAppContext } from '~/composables/useAppContext';
import type { ReadinessAttestation } from '~~/shared/readiness';

const route = useRoute();
const { data } = await useFetch<{ data: ReadinessAttestation[] }>(
  `/api/v1/repos/${String(route.params.repoId)}/attestations`,
);
const { org } = useAppContext();
const canWrite = computed(() => ['owner', 'admin'].includes(org.value?.role ?? ''));
</script>

<template>
  <ReadinessAttestationList :rows="data?.data ?? []" :can-write="canWrite" />
</template>
