import { mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import CommandPalette from '../app/components/motion/CommandPalette.vue';
import HoverCard from '../app/components/motion/HoverCard.vue';
import MetricTile from '../app/components/motion/MetricTile.vue';
import MotionTextReveal from '../app/components/motion/MotionTextReveal.vue';
import ScrollReveal from '../app/components/motion/ScrollReveal.vue';
import { DEFAULT_PALETTE_ITEMS, type PaletteItem } from '../app/components/motion/palette';

const ITEMS: PaletteItem[] = [
  { id: 'scans', label: 'Scans', href: '/app/scans' },
  { id: 'rules', label: 'Rules', href: '/app/rules' },
];

/** Minimal controllable MediaQueryList for the OS reduced-motion preference. */
function fakeReducedMotion(initial: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mediaQueryList = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener),
    addListener: (listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeListener: (listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  };

  return {
    mediaQueryList,
    setPreference(reduced: boolean) {
      mediaQueryList.matches = reduced;
      for (const listener of listeners) listener({ matches: reduced });
    },
  };
}

/** Inline styles that would mean a JS animation is still in flight. */
function hasMotion(style: string | undefined): boolean {
  return /opacity:\s*0|translate|blur\(/.test(style ?? '');
}

// happy-dom cannot complete Motion's native animations; exercise the instant
// reduced-motion path in every test so teardown never cancels an animation.
beforeEach(() => {
  const preference = fakeReducedMotion(true);
  vi.stubGlobal('matchMedia', () => preference.mediaQueryList);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('motion primitives', () => {
  it('renders a metric tile with text, not emoji icons', async () => {
    const wrapper = await mountSuspended(MetricTile, {
      props: { label: 'Evidence coverage', value: '0%', caption: 'No determinable evidence' },
    });
    expect(wrapper.text()).toContain('Evidence coverage');
    expect(wrapper.text()).toContain('0%');
    expect(wrapper.text()).toContain('No determinable evidence');
    expect(wrapper.find('[data-testid="metric-tile"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-tile"]').attributes('class')).toContain(
      'border-ink-200',
    );

    const gap = await mountSuspended(MetricTile, {
      props: {
        label: 'Unknown controls',
        value: '12',
        caption: 'Could not determine',
        tone: 'gap',
        testId: 'gap-tile',
      },
    });
    expect(gap.find('[data-testid="gap-tile"]').attributes('class')).toContain(
      'border-status-noncompliant-border',
    );
  });

  it('renders readiness text without forbidden language', async () => {
    const wrapper = await mountSuspended(MotionTextReveal, {
      props: { text: 'Insufficient evidence — no letter', as: 'p', id: 'evidence-note' },
    });
    // Word separators are non-breaking spaces; normalize them before wording checks.
    const rendered = wrapper
      .text()
      .replace(/\u00A0/g, ' ')
      .toLowerCase();
    expect(rendered).toContain('insufficient evidence');
    for (const phrase of ['compliant', 'non-compliant', 'violation of the act', 'certified']) {
      expect(rendered).not.toContain(phrase);
    }
    expect(wrapper.find('p').attributes('id')).toBe('evidence-note');
    expect(wrapper.findAll('span').length).toBeGreaterThan(1);

    const heading = await mountSuspended(MotionTextReveal, {
      props: { text: 'Readiness snapshot', as: 'h2' },
    });
    expect(heading.find('h2').exists()).toBe(true);
  });

  it('separates words with a non-breaking space in every text-reveal branch', async () => {
    for (const tag of ['h1', 'h2', 'p'] as const) {
      const wrapper = await mountSuspended(MotionTextReveal, {
        props: { text: 'Insufficient evidence here', as: tag },
      });
      // VTU's .text() trims whitespace, so inspect textContent directly.
      const words = wrapper.findAll('span').map((span) => span.element.textContent ?? '');
      expect(words).toHaveLength(3);
      words.forEach((word, index) => {
        expect(word.endsWith('\u00A0')).toBe(index < words.length - 1);
      });
    }
  });

  it('renders slotted scroll-reveal content', async () => {
    const wrapper = await mountSuspended(ScrollReveal, {
      slots: { default: 'Evidence-based readiness details' },
    });
    expect(wrapper.find('[data-testid="scroll-reveal"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Evidence-based readiness details');
  });

  it('exposes a typed, readiness-safe default palette', () => {
    const first: PaletteItem = DEFAULT_PALETTE_ITEMS[0]!;
    expect(first).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      href: '/app',
    });
    expect(new Set(DEFAULT_PALETTE_ITEMS.map((item) => item.id)).size).toBe(
      DEFAULT_PALETTE_ITEMS.length,
    );
    for (const item of DEFAULT_PALETTE_ITEMS) {
      expect(item.href.startsWith('/app')).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      for (const phrase of ['compliant', 'non-compliant', 'violation of the act', 'certified']) {
        expect(`${item.label} ${item.hint ?? ''}`.toLowerCase()).not.toContain(phrase);
      }
    }
  });

  it('supports keyboard navigation in the command palette', async () => {
    const wrapper = await mountSuspended(CommandPalette, {
      props: {
        open: true,
        items: [
          { id: 'scans', label: 'Scans', href: '/app/scans' },
          { id: 'rules', label: 'Rules', href: '/app/rules' },
        ],
      },
    });
    const input = wrapper.find('input');
    expect(input.exists()).toBe(true);
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('navigate')?.[0]).toEqual([
      { id: 'rules', label: 'Rules', href: '/app/rules' },
    ]);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('resets the active option whenever the query changes', async () => {
    const wrapper = await mountSuspended(CommandPalette, { props: { open: true, items: ITEMS } });
    const input = wrapper.find('input');
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.findAll('[role="option"]')[1]?.attributes('aria-selected')).toBe('true');

    await input.setValue('s');
    await nextTick();
    const options = wrapper.findAll('[role="option"]');
    expect(options).toHaveLength(2);
    expect(options[0]?.attributes('aria-selected')).toBe('true');
    expect(options[1]?.attributes('aria-selected')).toBe('false');
  });

  it('uses a generated listbox id and traps Tab in DOM order', async () => {
    const wrapper = await mountSuspended(CommandPalette, {
      props: { open: true, items: ITEMS },
      attachTo: document.body,
    });
    const input = wrapper.find('input');
    const listbox = wrapper.find('[role="listbox"]');
    const listboxId = listbox.attributes('id');
    expect(listboxId).toBeTruthy();
    expect(listboxId).not.toBe('palette-results');
    expect(input.attributes('aria-controls')).toBe(listboxId);

    const options = wrapper.findAll('[role="option"]');
    expect(options[0]?.attributes('tabindex')).toBe('0');
    const last = options[options.length - 1]!;
    last.element.focus();
    await last.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(input.element);

    await input.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last.element);
    wrapper.unmount();
  });

  it('restores focus to the previously focused element when the palette closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open palette';
    document.body.appendChild(opener);
    opener.focus();

    const wrapper = await mountSuspended(CommandPalette, {
      props: { open: false, items: ITEMS },
      attachTo: document.body,
    });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.find('input').element);

    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(document.activeElement).toBe(opener);

    wrapper.unmount();
    opener.remove();
  });

  it('shows a keyboard-accessible hover card and dismisses it', async () => {
    const wrapper = await mountSuspended(HoverCard, {
      props: { label: 'Evidence hash', detail: 'Hash-only reference', side: 'bottom' },
      slots: { default: 'Why this matters' },
    });
    const trigger = wrapper.find('[data-testid="hover-card-trigger"]');
    expect(trigger.attributes('tabindex')).toBe('0');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

    await trigger.trigger('focus');
    const tooltip = wrapper.find('[role="tooltip"]');
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.text()).toContain('Evidence hash');
    expect(tooltip.text()).toContain('Hash-only reference');
    expect(trigger.attributes('aria-describedby')).toBe(tooltip.attributes('id'));
    expect(tooltip.attributes('class')).toContain('top-full');

    await trigger.trigger('blur');
    await flushPromises();
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);

    await trigger.trigger('mouseenter');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true);
    await trigger.trigger('mouseleave');
    await flushPromises();
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
  });

  it('renders every primitive instantly when reduced motion is preferred', async () => {
    const text = await mountSuspended(MotionTextReveal, {
      props: { text: 'Insufficient evidence', as: 'p' },
    });
    expect(hasMotion(text.find('[data-testid="motion-text-reveal"]').attributes('style'))).toBe(
      false,
    );
    for (const span of text.findAll('span')) {
      expect(hasMotion(span.attributes('style'))).toBe(false);
    }

    const tile = await mountSuspended(MetricTile, {
      props: { label: 'Evidence coverage', value: '0%', caption: 'No determinable evidence' },
    });
    expect(hasMotion(tile.find('[data-testid="metric-tile"]').attributes('style'))).toBe(false);

    const reveal = await mountSuspended(ScrollReveal, { slots: { default: 'Details' } });
    expect(hasMotion(reveal.find('[data-testid="scroll-reveal"]').attributes('style'))).toBe(false);

    const palette = await mountSuspended(CommandPalette, {
      props: { open: true, items: ITEMS },
    });
    expect(hasMotion(palette.find('[role="presentation"]').attributes('style'))).toBe(false);
    expect(hasMotion(palette.find('[role="dialog"]').attributes('style'))).toBe(false);

    const card = await mountSuspended(HoverCard, {
      props: { label: 'Evidence hash', detail: 'Hash-only reference' },
      slots: { default: 'Detail' },
    });
    const trigger = card.find('[data-testid="hover-card-trigger"]');
    await trigger.trigger('focus');
    expect(hasMotion(trigger.attributes('style'))).toBe(false);
    expect(hasMotion(card.find('[role="tooltip"]').attributes('style'))).toBe(false);
  });
});
