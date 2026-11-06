import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with cwd = apps/web (package script), so resolve from there —
// import.meta.url is not a file: URL in the Nuxt test environment.
const CSS_PATH = join(process.cwd(), 'app/assets/css/main.css');

// Tokens pinned verbatim from docs/design.md §6 — the spec is the source of truth.
const REQUIRED_TOKENS: Record<string, string> = {
  '--color-brand-50': '#f0fdfa',
  '--color-brand-100': '#ccfbf1',
  '--color-brand-500': '#14b8a6',
  '--color-brand-600': '#0d9488',
  '--color-brand-700': '#0f766e',
  '--color-brand-900': '#134e4a',
  '--color-ink-50': '#f8fafc',
  '--color-ink-100': '#f1f5f9',
  '--color-ink-200': '#e2e8f0',
  '--color-ink-300': '#cbd5e1',
  '--color-ink-400': '#94a3b8',
  '--color-ink-500': '#64748b',
  '--color-ink-600': '#475569',
  '--color-ink-700': '#334155',
  '--color-ink-800': '#1e293b',
  '--color-ink-900': '#0f172a',
  '--color-risk-critical-bg': '#fef2f2',
  '--color-risk-critical-border': '#fecaca',
  '--color-risk-critical-text': '#991b1b',
  '--color-risk-critical-solid': '#dc2626',
  '--color-risk-high-bg': '#fff7ed',
  '--color-risk-high-border': '#fed7aa',
  '--color-risk-high-text': '#9a3412',
  '--color-risk-high-solid': '#ea580c',
  '--color-risk-medium-bg': '#fffbeb',
  '--color-risk-medium-border': '#fde68a',
  '--color-risk-medium-text': '#92400e',
  '--color-risk-medium-solid': '#d97706',
  '--color-risk-low-bg': '#f7fee7',
  '--color-risk-low-border': '#d9f99d',
  '--color-risk-low-text': '#3f6212',
  '--color-risk-low-solid': '#65a30d',
  '--color-risk-info-bg': '#eff6ff',
  '--color-risk-info-border': '#bfdbfe',
  '--color-risk-info-text': '#1e40af',
  '--color-risk-info-solid': '#2563eb',
  '--color-status-compliant-bg': '#f0fdf4',
  '--color-status-compliant-border': '#bbf7d0',
  '--color-status-compliant-text': '#166534',
  '--color-status-partial-bg': '#fffbeb',
  '--color-status-partial-border': '#fde68a',
  '--color-status-partial-text': '#92400e',
  '--color-status-noncompliant-bg': '#fef2f2',
  '--color-status-noncompliant-border': '#fecaca',
  '--color-status-noncompliant-text': '#991b1b',
  '--color-status-na-bg': '#f8fafc',
  '--color-status-na-border': '#e2e8f0',
  '--color-status-na-text': '#475569',
  '--color-confidence-direct-bg': '#f0fdf4',
  '--color-confidence-direct-text': '#166534',
  '--color-confidence-inferred-bg': '#fffbeb',
  '--color-confidence-inferred-text': '#92400e',
  '--color-confidence-advisory-bg': '#f8fafc',
  '--color-confidence-advisory-text': '#475569',
  '--radius-control': '0.375rem',
  '--radius-card': '0.625rem',
  '--radius-pill': '9999px',
  '--font-sans': '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  '--font-mono': '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
};

describe('design tokens (docs/design.md §6)', () => {
  // Prettier normalises quotes (singleQuote: true), so compare quote-agnostically.
  const css = readFileSync(CSS_PATH, 'utf8');
  const normalised = css.replace(/"/g, "'");

  it('uses CSS-first Tailwind 4 configuration', () => {
    expect(normalised).toContain("@import 'tailwindcss'");
    expect(normalised).toContain("@import '@nuxt/ui'");
    expect(css).toContain('@theme');
  });

  it.each(Object.entries(REQUIRED_TOKENS))('defines %s = %s', (token, value) => {
    // Allow flexible whitespace around the colon; quotes normalised above.
    const pattern = new RegExp(
      `${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${value
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/"/g, "'")}`,
    );
    expect(normalised).toMatch(pattern);
  });

  it('contains no AI-aesthetic tokens (purple, gradients, glow)', () => {
    // Strip comments first: the spec's own verbatim header comment says "No purple."
    // — the rule targets token VALUES, not prose (docs/design.md §14).
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/purple|violet|gradient|glow/i);
  });
});
