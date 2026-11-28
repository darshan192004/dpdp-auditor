<script setup lang="ts">
defineProps<{
  title: string;
  summary: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
}>();
</script>

<template>
  <section class="space-y-4">
    <header>
      <h1 class="text-ink-900 text-2xl font-semibold">{{ title }}</h1>
      <p class="text-ink-500 text-sm">{{ summary }}</p>
    </header>
    <div class="border-ink-200 overflow-x-auto rounded-[var(--radius-control)] border">
      <table class="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column" class="text-ink-500 px-3 py-2">
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index" class="border-ink-200 border-t">
            <td v-for="column in columns" :key="column" class="text-ink-800 px-3 py-2">
              {{ row[column] ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
