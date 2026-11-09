import type { HealthStatus } from '~/types/health';

/** Derived strings the health page renders (design §13: direct and calm). */
export interface HealthView {
  title: string;
  summary: string;
  version: string;
  uptime: string;
}

/**
 * Pure view model for the health payload — no Nuxt dependencies, so the page's
 * resolved state can be unit-tested without a running server (plan Task 5).
 */
export function formatHealth(health: HealthStatus): HealthView {
  return {
    title: 'System status',
    summary: 'All systems operational',
    version: `Version ${health.version}`,
    uptime: `Uptime ${formatUptime(health.uptimeSeconds)}`,
  };
}

/** Longest sensible unit pair for the reported uptime, e.g. `1h 1m`, `1d 1h`. */
export function formatUptime(uptimeSeconds: number): string {
  const total = Math.max(0, Math.floor(uptimeSeconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
