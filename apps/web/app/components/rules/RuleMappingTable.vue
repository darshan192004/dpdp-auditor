<script setup lang="ts">
import type { RuleMapping } from '~~/shared/rules';
import ConfidenceBadge from '../findings/ConfidenceBadge.vue';
import ScannerLabel from '../findings/ScannerLabel.vue';

defineProps<{ mappings: RuleMapping[] }>();
</script>

<template>
  <div
    v-if="mappings.length === 0"
    class="bg-surface-raised text-ink-600 rounded-[var(--radius-card)] px-4 py-3 text-sm"
  >
    No scanner rule maps to this control. It stays in the catalog for completeness, but the
    automated scanners cannot produce evidence for it.
  </div>

  <div
    v-else
    class="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)]"
  >
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          Scanner rules that produce evidence for this DPDPA control.
        </caption>
        <thead>
          <tr class="bg-ink-100">
            <th scope="col" class="text-ink-600 px-4 py-2 text-xs font-medium">Scanner</th>
            <th scope="col" class="text-ink-600 px-4 py-2 text-xs font-medium">Rule ID</th>
            <th scope="col" class="text-ink-600 px-4 py-2 text-xs font-medium">Evidence</th>
            <th scope="col" class="text-ink-600 px-4 py-2 text-xs font-medium">Why it maps</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="mapping in mappings"
            :key="`${mapping.scanner}-${mapping.ruleId}`"
            class="border-ink-100 border-t align-top"
          >
            <td class="px-4 py-2.5 whitespace-nowrap">
              <ScannerLabel :scanner="mapping.scanner" />
            </td>
            <td class="text-ink-800 px-4 py-2.5 font-mono text-xs">{{ mapping.ruleId }}</td>
            <td class="px-4 py-2.5 whitespace-nowrap">
              <ConfidenceBadge :confidence="mapping.confidence" />
            </td>
            <td class="text-ink-600 px-4 py-2.5">{{ mapping.rationale }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
