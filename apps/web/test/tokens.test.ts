import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with cwd = apps/web (package script), so resolve from there —
// import.meta.url is not a file: URL in the Nuxt test environment.
const CSS_PATH = join(process.cwd(), 'app/assets/css/main.css');

// Tokens pinned verbatim from docs/design.md §6 — the spec is the source of truth.
const REQUIRED_TOKENS: Record<string, string> = {
  '--color-brand-50': '#0c2217',
  '--color-brand-100': '#143524',
  '--color-brand-500': '#4ade80',
  '--color-brand-600': '#86efac',
  '--color-brand-700': '#22c55e',
  '--color-brand-900': '#bbf7d0',
  '--color-surface': '#0e1412',
  '--color-surface-raised': '#141b19',
  '--color-ink-50': '#070a09',
  '--color-ink-100': '#161f1c',
  '--color-ink-200': '#1f2b27',
  '--color-ink-300': '#2d3b36',
  '--color-ink-400': '#748981',
  '--color-ink-500': '#8ba09a',
  '--color-ink-600': '#a9bdb7',
  '--color-ink-700': '#c8d8d3',
  '--color-ink-800': '#e2ece8',
  '--color-ink-900': '#f5faf8',
  '--color-risk-critical-bg': '#2a1013',
  '--color-risk-critical-border': '#5a1d24',
  '--color-risk-critical-text': '#ff9aa3',
  '--color-risk-critical-solid': '#f87171',
  '--color-risk-high-bg': '#2a1a0e',
  '--color-risk-high-border': '#5a3416',
  '--color-risk-high-text': '#ffb37a',
  '--color-risk-high-solid': '#fb923c',
  '--color-risk-medium-bg': '#271f08',
  '--color-risk-medium-border': '#55420f',
  '--color-risk-medium-text': '#f5d06a',
  '--color-risk-medium-solid': '#facc15',
  '--color-risk-low-bg': '#14210c',
  '--color-risk-low-border': '#2f4a18',
  '--color-risk-low-text': '#b8e986',
  '--color-risk-low-solid': '#a3e635',
  '--color-risk-info-bg': '#0e1c2a',
  '--color-risk-info-border': '#1d3b5a',
  '--color-risk-info-text': '#93c5fd',
  '--color-risk-info-solid': '#60a5fa',
  '--color-status-compliant-bg': '#0c2217',
  '--color-status-compliant-border': '#1c4a30',
  '--color-status-compliant-text': '#86efac',
  '--color-status-partial-bg': '#271f08',
  '--color-status-partial-border': '#55420f',
  '--color-status-partial-text': '#f5d06a',
  '--color-status-noncompliant-bg': '#2a1013',
  '--color-status-noncompliant-border': '#5a1d24',
  '--color-status-noncompliant-text': '#ff9aa3',
  '--color-status-na-bg': '#141b19',
  '--color-status-na-border': '#26332e',
  '--color-status-na-text': '#8ba09a',
  '--color-confidence-direct-bg': '#0c2217',
  '--color-confidence-direct-text': '#86efac',
  '--color-confidence-inferred-bg': '#271f08',
  '--color-confidence-inferred-text': '#f5d06a',
  '--color-confidence-advisory-bg': '#141b19',
  '--color-confidence-advisory-text': '#a9bdb7',
  '--radius-control': '0.375rem',
  '--radius-card': '0.75rem',
  '--radius-pill': '9999px',
  '--font-sans':
    "'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--font-mono': "'Geist Mono Variable', ui-monospace, 'SFMono-Regular', Menlo, monospace",
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
