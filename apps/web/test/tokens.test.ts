import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with cwd = apps/web (package script), so resolve from there —
// import.meta.url is not a file: URL in the Nuxt test environment.
const CSS_PATH = join(process.cwd(), 'app/assets/css/main.css');

// Tokens pinned verbatim from docs/design.md §6 — the spec is the source of truth.
// Values are sampled from the 2026 cybersecurity dashboard reference: pure-black
// rail, neutral near-black canvas, lifted neutral cards, one signal green.
const REQUIRED_TOKENS: Record<string, string> = {
  '--color-brand-50': '#0b2417',
  '--color-brand-100': '#12331f',
  '--color-brand-500': '#3dde78',
  '--color-brand-600': '#5ce98c',
  '--color-brand-700': '#6ee79a',
  '--color-brand-900': '#c9f8da',
  '--color-canvas': '#0b0b0d',
  '--color-surface': '#141416',
  '--color-surface-raised': '#1d1d20',
  '--color-ink-50': '#000000',
  '--color-ink-100': '#1a1a1d',
  '--color-ink-200': '#26262a',
  '--color-ink-300': '#36363c',
  '--color-ink-400': '#8b8b95',
  '--color-ink-500': '#9a9aa4',
  '--color-ink-600': '#b4b4bd',
  '--color-ink-700': '#cfcfd6',
  '--color-ink-800': '#e4e4e9',
  '--color-ink-900': '#f7f7f9',
  '--color-risk-critical-bg': '#2a1210',
  '--color-risk-critical-border': '#5c231b',
  '--color-risk-critical-text': '#ff8f86',
  '--color-risk-critical-solid': '#f0654f',
  '--color-risk-high-bg': '#2a1a10',
  '--color-risk-high-border': '#5a3320',
  '--color-risk-high-text': '#ffb27a',
  '--color-risk-high-solid': '#e26841',
  '--color-risk-medium-bg': '#26200c',
  '--color-risk-medium-border': '#55460f',
  '--color-risk-medium-text': '#f0d38a',
  '--color-risk-medium-solid': '#eecb83',
  '--color-risk-low-bg': '#0d2317',
  '--color-risk-low-border': '#1e4a30',
  '--color-risk-low-text': '#8ff0b4',
  '--color-risk-low-solid': '#3dde78',
  '--color-risk-info-bg': '#111a2e',
  '--color-risk-info-border': '#23345c',
  '--color-risk-info-text': '#9db4ff',
  '--color-risk-info-solid': '#5b7cf0',
  '--color-status-compliant-bg': '#0b2417',
  '--color-status-compliant-border': '#1e4a30',
  '--color-status-compliant-text': '#8ff0b4',
  '--color-status-partial-bg': '#26200c',
  '--color-status-partial-border': '#55460f',
  '--color-status-partial-text': '#f0d38a',
  '--color-status-noncompliant-bg': '#2a1210',
  '--color-status-noncompliant-border': '#5c231b',
  '--color-status-noncompliant-text': '#ff8f86',
  '--color-status-na-bg': '#1a1a1d',
  '--color-status-na-border': '#26262a',
  '--color-status-na-text': '#9a9aa4',
  '--color-confidence-direct-bg': '#0b2417',
  '--color-confidence-direct-text': '#8ff0b4',
  '--color-confidence-inferred-bg': '#26200c',
  '--color-confidence-inferred-text': '#f0d38a',
  '--color-confidence-advisory-bg': '#1a1a1d',
  '--color-confidence-advisory-text': '#b4b4bd',
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
