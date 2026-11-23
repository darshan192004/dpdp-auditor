import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    ORCHESTRATOR_HMAC_KEY: z.string().min(32),
    ORCHESTRATOR_INTERNAL_KEY: z.string().min(32),
    // JSON `flag -> boolean`; parsed/validated by FeatureFlagsService (P1-33).
    FEATURE_FLAGS: z.string().optional(),
    // P4-02: directory containing manifest.yaml + the YAML rule pack.
    RULE_PACK_DIR: z.string().min(1).optional(),
    // P4-02: Ed25519 public key (PEM). When set, an unsigned pack fails closed.
    RULE_PACK_PUBLIC_KEY: z.string().min(1).optional(),
    // Runner configuration — architecture.md §11: driver selection and Job spec
    RUNNER_DRIVER: z.enum(['kubernetes', 'docker']).default('kubernetes'),
    SCANNERS_NAMESPACE: z.string().min(1).default('scanners'),
    RUNNER_IMAGE: z
      .string()
      .min(1)
      .default('registry.example.com/dpdpa/scan-runner@sha256:<digest>'),
    ORCHESTRATOR_CALLBACK_URL: z.string().url().optional(),
    // Docker runner socket/pipe: /var/run/docker.sock on Linux,
    // //./pipe/docker_engine on Windows. Defaults to the Linux path.
    DOCKER_SOCKET_PATH: z.string().min(1).optional(),
    // Local PDF storage shared by the report worker and API process.
    REPORTS_STORAGE_DIR: z.string().min(1).optional(),
    // Chromium runs separately from the distroless API image. Keep this endpoint private.
    REPORTS_BROWSER_WS_ENDPOINT: z
      .string()
      .url()
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            url.protocol === 'wss:' ||
            (url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
          );
        } catch {
          return false;
        }
      }, 'Use WSS for remote browsers or WS only for a loopback sidecar')
      .optional(),
    // Email configuration for report notifications (dev/test only)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    // Development-only limit overrides. `0` means no size cap; unset keeps the
    // per-plan caps from docs/PRD.md §10. Guarded below for production builds.
    REPO_SIZE_CAP_MB: z.coerce.number().int().min(0).optional(),
    UNLIMITED_PLAN_QUOTA: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    // Optional per-scanner timeouts forwarded to the runner only when present.
    TIMEOUT_CLONE: z.coerce.number().int().positive().optional(),
    TIMEOUT_SEMGREP: z.coerce.number().int().positive().optional(),
    TIMEOUT_CHECKOV: z.coerce.number().int().positive().optional(),
    TIMEOUT_GITLEAKS: z.coerce.number().int().positive().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.REPO_SIZE_CAP_MB === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['REPO_SIZE_CAP_MB'],
        message: 'REPO_SIZE_CAP_MB=0 (unlimited) is not allowed in production',
      });
    }
    if (env.UNLIMITED_PLAN_QUOTA) {
      ctx.addIssue({
        code: 'custom',
        path: ['UNLIMITED_PLAN_QUOTA'],
        message: 'UNLIMITED_PLAN_QUOTA=true is not allowed in production',
      });
    }
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
