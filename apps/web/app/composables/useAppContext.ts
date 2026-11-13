import { useState } from '#imports';
import type { MeUser, OrgContext } from '~~/shared/auth';

/** Org and user shapes live in `shared/auth.ts` so server and client agree. */
export type { OrgContext };

/**
 * Shared app context as SSR-safe `useState` refs (design §7.1/§7.6).
 *
 * These serialise into the Nuxt payload, so they are safe across requests and
 * are never used for server data — server data belongs in `useFetch`/`useAsyncData`
 * (design §7.1) and UI-only preferences belong in Pinia (§7.4).
 */
export function useAppContext() {
  const user = useState<MeUser | null>('user', () => null);
  const org = useState<OrgContext | null>('org', () => null);
  const features = useState<Record<string, boolean>>('features', () => ({}));
  const commandPaletteOpen = useState<boolean>('commandPaletteOpen', () => false);
  const lastScanId = useState<string | null>('lastScanId', () => null);

  return { user, org, features, commandPaletteOpen, lastScanId };
}
