import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url(),
  ORCHESTRATOR_HMAC_KEY: z.string().min(32),
  ORCHESTRATOR_INTERNAL_KEY: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid orchestrator configuration: ${fields.join('; ')}`);
  }
  return result.data;
}
