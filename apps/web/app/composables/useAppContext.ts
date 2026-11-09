import { useState } from '#imports';

/** Organisation context held in the `org` key (design §7.6). Phase 2 fills it. */
export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  retentionDays: number;
}

/**
 * Shared app context as SSR-safe `useState` refs (design §7.1/§7.6).
 *
 * These serialise into the Nuxt payload, so they are safe across requests and
 * are never used for server data — server data belongs in `useFetch`/`useAsyncData`
 * (design §7.1) and UI-only preferences belong in Pinia (§7.4).
 */
export function useAppContext() {
  // TODO(Phase 2 auth): `user` is not in design §7.6 yet — auth owns its shape.
  // The route middleware only needs presence, so it stays `unknown | null`.
  const user = useState<unknown | null>('user', () => null);

  const org = useState<OrgContext | null>('org', () => null);
  const features = useState<Record<string, boolean>>('features', () => ({}));
  const commandPaletteOpen = useState<boolean>('commandPaletteOpen', () => false);
  const lastScanId = useState<string | null>('lastScanId', () => null);

  return { user, org, features, commandPaletteOpen, lastScanId };
}
