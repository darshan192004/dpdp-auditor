import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { StartedTestContainer } from 'testcontainers';
import { planDatabase } from './helpers/resolve-db-url.js';

const orchestratorDir = fileURLToPath(new URL('../..', import.meta.url));

function probeDocker(): boolean {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: 'ignore',
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const plan = planDatabase(process.env.TEST_DATABASE_URL, probeDocker());

  if (plan.mode === 'skip') {
    process.env.TEST_DATABASE_URL = '';
    console.warn(`[integration] skipping: ${plan.reason}`);
    return async () => {};
  }

  let url = plan.mode === 'existing' ? plan.url : '';
  let postgres: StartedTestContainer | undefined;
  let redis: StartedTestContainer | undefined;

  if (plan.mode === 'container') {
    const { GenericContainer, Wait } = await import('testcontainers');
    postgres = await new GenericContainer('postgres:16')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'dpdpa_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 1))
      .start();
    url = `postgresql://test:test@127.0.0.1:${postgres.getMappedPort(5432)}/dpdpa_test`;

    if (!process.env.REDIS_TEST_URL) {
      redis = await new GenericContainer('redis:7')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1))
        .start();
      process.env.REDIS_TEST_URL = `redis://127.0.0.1:${redis.getMappedPort(6379)}`;
    }
  }

  process.env.TEST_DATABASE_URL = url;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: orchestratorDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  return async () => {
    await postgres?.stop();
    await redis?.stop();
  };
}
