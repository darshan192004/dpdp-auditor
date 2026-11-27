import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = ['NODE_ENV', 'NUXT_SESSION_NAME', 'NUXT_SESSION_COOKIE_SECURE'] as const;
let savedEnv: Record<string, string | undefined>;

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadNuxtConfig(): Promise<{
  runtimeConfig: {
    session: { name: string; cookie: { secure: boolean } };
  };
}> {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config);
  vi.resetModules();
  const { default: config } = await import('../nuxt.config');
  return config as never;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  setEnv(savedEnv);
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('session cookie configuration', () => {
  it('keeps the secure __Host- cookie by default in production', async () => {
    setEnv({
      NODE_ENV: 'production',
      NUXT_SESSION_NAME: undefined,
      NUXT_SESSION_COOKIE_SECURE: undefined,
    });

    const config = await loadNuxtConfig();

    expect(config.runtimeConfig.session.name).toBe('__Host-dpdpa_session');
    expect(config.runtimeConfig.session.cookie.secure).toBe(true);
  });

  it('allows an explicit insecure cookie for HTTP port-forward verification', async () => {
    setEnv({
      NODE_ENV: 'production',
      NUXT_SESSION_NAME: 'dpdpa_session',
      NUXT_SESSION_COOKIE_SECURE: 'false',
    });

    const config = await loadNuxtConfig();

    expect(config.runtimeConfig.session.name).toBe('dpdpa_session');
    expect(config.runtimeConfig.session.cookie.secure).toBe(false);
  });

  it('uses the configured cookie name in the server session guard', async () => {
    setEnv({
      NODE_ENV: 'production',
      NUXT_SESSION_NAME: 'dpdpa_session',
      NUXT_SESSION_COOKIE_SECURE: 'false',
    });
    vi.resetModules();

    const { SESSION_COOKIE_NAME } = await import('../server/utils/session');

    expect(SESSION_COOKIE_NAME).toBe('dpdpa_session');
  });

  it('uses the secure production cookie name in the server session guard by default', async () => {
    setEnv({
      NODE_ENV: 'production',
      NUXT_SESSION_NAME: undefined,
      NUXT_SESSION_COOKIE_SECURE: undefined,
    });
    vi.resetModules();

    const { SESSION_COOKIE_NAME } = await import('../server/utils/session');

    expect(SESSION_COOKIE_NAME).toBe('__Host-dpdpa_session');
  });
});
