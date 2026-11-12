<script setup lang="ts">
import { computed } from 'vue';

import type { FindingScanner } from '~~/shared/findings';
import AppIcon from '../ui/AppIcon.vue';

const props = defineProps<{ scanner: FindingScanner }>();

const META: Record<FindingScanner, { label: string; icon: string }> = {
  semgrep: { label: 'Semgrep', icon: 'code' },
  checkov: { label: 'Checkov', icon: 'cloud' },
  gitleaks: { label: 'Gitleaks', icon: 'key' },
};

const meta = computed(() => META[props.scanner]);
</script>

<template>
  <span class="text-ink-600 inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
    <AppIcon :name="meta.icon" :size="14" class="text-ink-400" />
    {{ meta.label }}
  </span>
</template>
