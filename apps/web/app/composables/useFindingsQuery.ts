import { computed } from 'vue';
import { useRoute, useRouter } from '#imports';

import {
  parseFindingsQuery,
  serialiseFindingsQuery,
  hasActiveFilters,
} from '~~/shared/findings-query';
import type { FindingsFilters } from '~~/shared/findings';

/**
 * Findings filters live in the URL (docs/design.md §7.4), so a filtered view is
 * shareable and the back button restores it. The page only reads this state.
 */
export function useFindingsQuery() {
  const route = useRoute();
  const router = useRouter();

  const filters = computed(() => parseFindingsQuery(route.query as Record<string, unknown>));
  const hasFilters = computed(() => hasActiveFilters(filters.value));

  /** Applies a patch and resets to page 1 unless the caller is paging. */
  async function update(patch: Partial<FindingsFilters>): Promise<void> {
    const next: FindingsFilters = { ...filters.value, ...patch };
    if (patch.page === undefined) next.page = 1;
    await router.replace({ query: serialiseFindingsQuery(next) });
  }

  async function clear(): Promise<void> {
    await router.replace({ query: {} });
  }

  return { filters, hasFilters, update, clear };
}
