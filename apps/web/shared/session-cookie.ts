/** Shared session-cookie policy for Nitro config and server-side guards. */
export interface SessionCookieSettings {
  name: string;
  secure: boolean;
}

/**
 * Production keeps the `__Host-` prefix and `Secure` flag. An explicit
 * `NUXT_SESSION_NAME`/`NUXT_SESSION_COOKIE_SECURE` pair allows an HTTPS-only
 * deployment to be verified over a local HTTP port-forward without weakening
 * the deployed default.
 */
export function sessionCookieSettings(env: NodeJS.ProcessEnv = process.env): SessionCookieSettings {
  const isProduction = env.NODE_ENV === 'production';
  return {
    name: env.NUXT_SESSION_NAME ?? (isProduction ? '__Host-dpdpa_session' : 'dpdpa_session'),
    secure:
      env.NUXT_SESSION_COOKIE_SECURE === undefined
        ? isProduction
        : env.NUXT_SESSION_COOKIE_SECURE === 'true',
  };
}
