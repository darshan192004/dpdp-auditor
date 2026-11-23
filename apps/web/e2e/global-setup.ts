import { expect, request } from '@playwright/test';

export default async function waitForNuxt(): Promise<void> {
  const client = await request.newContext({ baseURL: 'http://localhost:3000' });
  try {
    // The dev listener serves an HTML loading page before Nitro has built its routes.
    await expect
      .poll(
        async () => {
          const response = await client.get('/api/health');
          if (!response.ok() || !response.headers()['content-type']?.includes('application/json'))
            return false;
          return (await response.json()).status === 'ok';
        },
        { timeout: 120_000 },
      )
      .toBe(true);
  } finally {
    await client.dispose();
  }
}
