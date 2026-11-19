<script setup lang="ts">
import DsDrawer from '~/components/ds/DsDrawer.vue';
import ScanSubmitForm from '~/components/scan/ScanSubmitForm.vue';
import type { SavedRepoView } from '~~/shared/repo';
import type { ScanProfile, ScanQuota } from '~~/shared/scan';

defineProps<{
  open: boolean;
  repos: SavedRepoView[];
  quota: ScanQuota | null;
  submitting?: boolean;
}>();
const emit = defineEmits<{
  close: [];
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

function onSubmit(payload: {
  repositoryId?: string;
  githubUrl?: string;
  ref?: string;
  profile: ScanProfile;
  idempotencyKey: string;
}): void {
  emit('submit', payload);
}
</script>

<template>
  <DsDrawer :open="open" title="Start a scan" @close="emit('close')">
    <ScanSubmitForm :repos="repos" :quota="quota" :can-submit="!submitting" @submit="onSubmit" />
    <p v-if="submitting" role="status" class="text-ink-400 mt-3 text-sm">Starting scan…</p>
  </DsDrawer>
</template>
