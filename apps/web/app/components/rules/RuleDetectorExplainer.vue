<script setup lang="ts">
import type { DetectorExplanation } from '~~/shared/detectors';

defineProps<{ detectors: DetectorExplanation[] }>();
</script>

<template>
  <section aria-labelledby="detector-explainer-heading" class="space-y-2">
    <h2 id="detector-explainer-heading" class="text-ink-900 text-sm font-semibold">
      How evidence is found
    </h2>
    <p class="text-ink-600 text-sm leading-relaxed">
      Each detector reads a named input and emits bounded signals. A detector that is unavailable
      produces Could not determine; it never produces a pass. An absence rule looks for the named
      token and records no value from the source file.
    </p>
    <article
      v-for="detector in detectors"
      :key="detector.id"
      class="bg-surface border-ink-200 rounded-[var(--radius-card)] p-3 text-sm shadow-[var(--shadow-card)]"
    >
      <h3 class="text-ink-900 font-mono">{{ detector.id }}</h3>
      <p class="text-ink-700 mt-1">
        Inputs: {{ detector.inputs.join(', ') }} · Outputs: {{ detector.outputs.join(', ') }}
      </p>
      <p class="text-ink-500 mt-1 text-xs">
        Timeout: {{ detector.timeoutMs }} ms · Failure mode: {{ detector.failureMode }}
      </p>
      <ul v-if="detector.controls.length > 0" class="text-ink-700 mt-2 list-disc pl-5">
        <li v-for="control in detector.controls" :key="control.code">
          {{ control.code }} · {{ control.evidenceMode }} ·
          {{ control.absenceTokens.join(', ') || 'no absence tokens' }}
        </li>
      </ul>
    </article>
  </section>
</template>
