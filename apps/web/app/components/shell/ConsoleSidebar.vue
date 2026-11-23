<script setup lang="ts">
import AppIcon from '~/components/ui/AppIcon.vue';

const emit = defineEmits<{ navigate: [] }>();
const route = useRoute();

const NAV = [
  { label: 'Overview', to: '/app', icon: 'layout-grid', prefix: '/app' },
  { label: 'Scans', to: '/app/scans', icon: 'search', prefix: '/app/scans' },
  {
    label: 'Remediation',
    to: '/app/remediation',
    icon: 'shield-check',
    prefix: '/app/remediation',
  },
  { label: 'Rules', to: '/app/rules', icon: 'file-text', prefix: '/app/rules' },
  { label: 'Audit', to: '/app/audit', icon: 'clipboard-check', prefix: '/app/audit' },
  { label: 'Settings', to: '/app/settings/org', icon: 'key', prefix: '/app/settings' },
  { label: 'Health', to: '/health', icon: 'activity', prefix: '/health' },
] as const;

function isActive(item: (typeof NAV)[number]): boolean {
  return item.to === '/app' ? route.path === '/app' : route.path.startsWith(item.prefix);
}
</script>

<template>
  <aside
    class="bg-ink-50 border-ink-200 flex h-full w-64 flex-col overflow-hidden border-r"
    aria-label="Console navigation"
  >
    <div class="flex h-14 shrink-0 items-center gap-3 px-4">
      <div
        class="bg-brand-500 text-ink-50 flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] font-mono text-xs font-bold"
        aria-hidden="true"
      >
        DA
      </div>
      <div class="min-w-0">
        <p class="text-ink-500 font-mono text-[10px] tracking-[0.2em]">DPDPA</p>
        <p class="text-ink-900 truncate text-sm font-semibold">Signal Console</p>
      </div>
    </div>

    <p
      class="text-ink-400 shrink-0 px-6 pt-5 pb-2 font-mono text-[10px] tracking-[0.18em] uppercase"
    >
      Workspace
    </p>

    <nav aria-label="Primary" class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
      <NuxtLink
        v-for="item in NAV"
        :key="item.to"
        :to="item.to"
        :aria-current="isActive(item) ? 'page' : undefined"
        class="relative flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm transition-colors duration-[var(--motion-fast)]"
        :class="
          isActive(item)
            ? 'bg-surface-raised text-ink-900'
            : 'text-ink-400 hover:bg-surface hover:text-ink-800'
        "
        @click="emit('navigate')"
      >
        <span
          v-if="isActive(item)"
          class="bg-brand-500 absolute inset-y-1.5 left-0 w-0.5 rounded-full"
          aria-hidden="true"
        />
        <AppIcon :name="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div
      class="border-ink-200 m-2 flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2.5"
    >
      <span class="bg-brand-500 h-1.5 w-1.5 rounded-full" aria-hidden="true" />
      <span class="text-ink-400 font-mono text-[11px]">MVP · local stack</span>
    </div>
  </aside>
</template>
