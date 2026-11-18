---
name: DPDPA Auditor
description: A dark, evidence-first compliance workbench for auditing GitHub repositories against the DPDP Act.
colors:
  signal-green: "#3dde78"
  signal-green-deep: "#12331f"
  signal-green-bright: "#5ce98c"
  signal-green-mist: "#c9f8da"
  rail-black: "#000000"
  canvas: "#0b0b0d"
  surface: "#141416"
  surface-raised: "#1d1d20"
  ink-400: "#8b8b95"
  ink-500: "#9a9aa4"
  ink-700: "#cfcfd6"
  ink-800: "#e4e4e9"
  ink-900: "#f7f7f9"
  risk-critical: "#f0654f"
  risk-critical-surface: "#2a1210"
  risk-critical-text: "#ff8f86"
  risk-high: "#e26841"
  risk-medium: "#eecb83"
  risk-low: "#3dde78"
  risk-info: "#5b7cf0"
typography:
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.06em"
  score:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.1
rounded:
  control: "6px"
  card: "12px"
  pill: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-green}"
    textColor: "{colors.rail-black}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.signal-green-bright}"
    textColor: "{colors.rail-black}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-800}"
    rounded: "{rounded.card}"
    padding: "16px"
  badge-critical:
    backgroundColor: "{colors.risk-critical-surface}"
    textColor: "{colors.risk-critical-text}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: DPDPA Auditor

## Overview

**Creative North Star: "Signal Console"**

The DPDPA Auditor is a security console, not a marketing site. It answers three
questions in a fixed order: how exposed are we, what exactly is wrong, and what
do I do next. Every screen is built around evidence — a score always travels
with its coverage status and the findings that produced it, never alone. The
result is data-dense and calm: critical states are loud, but the interface never
uses fear-based copy, flashing elements, or decorative shine.

The visual language is a **carbon ink ladder** with one **signal green** accent.
Separation comes from surface steps and, for lifted panels, layered shadows —
not from coloured outlines. Type is Geist Sans for content and Geist Mono for
technical labels, kept tight and quiet. This document follows the structure of
the Vercel DESIGN.md (the canonical eight-section layout and token-reference
style) but every value, rule, and component is this product's own dark console
system. Where the incumbent code and this document disagree, the token values
in `apps/web/app/assets/css/main.css` are the source of truth.

**Key Characteristics:**
- Pure-black navigation rail, near-black canvas, neutral lifted cards, one green accent.
- Evidence-first hierarchy: score, coverage, then a filterable findings table.
- Dense, precise, quiet controls with 6 px radii and monospace metadata.
- Surface steps for resting depth; pronounced layered shadows for floating panels.
- Dark-only (`color-scheme: dark`); no light theme is a supported surface.

## Colors

The palette is a neutral carbon ladder with a single saturated signal green and
a small, fixed set of semantic risk/status pairs. Colour is information, never
decoration.

### Primary
- **Signal Green** (`#3dde78`): The only brand accent. Primary actions, focus
  rings, selection, and low-risk/compliant states. Bright variant `#5ce98c` for
  hover; deep `#12331f` for tinted surfaces; mist `#c9f8da` for high-contrast text.

### Neutral
- **Rail Black** (`#000000`): The navigation rail and deepest surface step.
- **Canvas** (`#0b0b0d`): The page background beneath all content.
- **Surface** (`#141416`): Cards and panels resting on the canvas.
- **Surface Raised** (`#1d1d20`): Hovered/lifted cards and nested containers.
- **Ink 400–500** (`#8b8b95`, `#9a9aa4`): Muted metadata and table captions.
- **Ink 700–900** (`#cfcfd6` – `#f7f7f9`): Body, headings, and highlighted text.

### Semantic (Risk & Status)
- **Critical** (`#f0654f`) / surface `#2a1210` / text `#ff8f86`: Critical findings and non-compliant status.
- **High** (`#e26841`), **Medium** (`#eecb83`), **Info** (`#5b7cf0`): Ordered severity and informational states.
- **Low** (`#3dde78`): Low risk and compliant status; reuses Signal Green.

Each semantic state ships as a contrast-checked background / border / text
triple. Never pair a semantic background with an ink text token, or a semantic
text token with a neutral background.

### Named Rules
**The One Voice Rule.** Signal Green appears on 10% or fewer of any screen. Its
rarity is what makes it mean "actionable" and "healthy".

**The Neutral Ladder Rule.** Green never replaces a grey. Text, dividers, and
resting surfaces stay on the carbon ink ladder unless they are encoding risk or
status.

## Typography

**Display Font:** Geist Variable (fallbacks: ui-sans-serif, system-ui, Segoe UI)
**Body Font:** Geist Variable (same family as display)
**Label/Mono Font:** Geist Mono Variable (fallbacks: ui-monospace, SFMono-Regular, Menlo)

**Character:** Geist Sans is neutral and tightly tracked, giving data screens a
technical but readable voice. Geist Mono marks anything machine-derived —
file paths, line numbers, clause IDs, evidence hashes — so evidence is visually
distinct from prose.

### Hierarchy
- **Display / Score** (600, 36 / 40): The single compliance score number only.
- **Headline / Page title** (600, 24 / 32): `text-2xl`; one `h1` per page.
- **Title / Section** (600, 20 / 28): `text-xl`; card and section headings.
- **Body** (400, 16 / 24): `text-base`; prose, capped at ~70ch.
- **Label** (500, 12 / 16, `0.06em`): `text-xs`; mono metadata, captions, badges.

### Named Rules
**The One H1 Rule.** Exactly one `h1` per page; do not skip heading levels.

## Layout

A persistent pure-black rail sits left of a near-black canvas on desktop; the
canvas holds surface-stepped cards in a responsive grid. Density is high by
default — tables use 12 px cell padding and cards use 16–24 px padding — so a
triage screen shows findings without excessive scrolling. Spacing follows a
4 px scale (1, 2, 3, 4, 6, 8, 12, 16, 24). On narrow viewports the rail collapses
and cards stack into a single column. All breakpoints and grid definitions live
in the app shell (`apps/web/app/layouts/app.vue`) and the Tailwind theme.

## Elevation & Depth

Depth is layered: a four-step surface ladder (rail → canvas → card → raised)
carries resting state, and floating panels lift off it with pronounced shadows.
Cards carry no outline — the surface step separates them. Hairlines
(`--color-ink-200`) are reserved for table dividers and form controls.

### Shadow Vocabulary
- **Card** (`--shadow-card: 0 1px 2px 0 rgb(0 0 0 / 0.6)`): Resting and hovered cards, subtle contact shadow.
- **Popover** (`--shadow-popover: 0 16px 40px -12px rgb(0 0 0 / 0.85)`): Slideovers, dialogs, popovers, and other layered floating panels.

### Named Rules
**The Layered Float Rule.** A panel that can overlay content floats with the
popover shadow and a raised surface; a panel that sits in the grid stays on its
surface step with the card shadow. Never outline a card to fake elevation.

## Shapes

Control corners are 6 px (`--radius-control: 0.375rem`); cards are 12 px
(`--radius-card: 0.75rem`); badges and avatars are pills (`--radius-pill:
9999px`). Corners are deliberately small — no `rounded-2xl` and no arbitrary
pixel radii. Focus rings use a 2 px Signal Green ring with a 2 px canvas
offset, so they read cleanly against the dark surface.

## Components

### Buttons
- **Shape:** 6 px radius; compact 8 px / 16 px padding.
- **Primary:** Signal Green background, rail-black text; hover brightens to `#5ce98c`.
- **Secondary / Ghost:** Transparent on surface with an ink hairline; no green fill.
- **Focus:** 2 px Signal Green ring, 2 px canvas offset.

### Chips & Badges
- **Style:** Pill radius, semantic background / border / text triple from the risk or status scale.
- **State:** Selected filters use a Signal Green tint; unselected stay on the neutral ladder.

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** `surface`, lifting to `surface-raised` on hover.
- **Shadow Strategy:** Card shadow in the grid; popover shadow when floating (see Elevation).
- **Border:** None at rest; hairline only for dividers and controls.
- **Internal Padding:** 16–24 px from the 4 px scale.

### Inputs / Fields
- **Style:** Dark surface fill, ink hairline border, 6 px radius, mono labels.
- **Focus:** Signal Green ring; border shifts toward Signal Green.
- **Error / Disabled:** Semantic critical border/text; disabled drops to ink-400 at reduced opacity.

### Navigation
- **Style:** Pure-black rail on desktop, collapsible on mobile; mono uppercase section labels.
- **State:** Active item uses Signal Green text/indicator; inactive uses ink-400/500.

### Score Card (signature component)
- Combines the 36 px score number, a grade, and coverage status in one surface-stepped card. The score is never rendered without its coverage indicator and a link to the findings that produced it.

## Do's and Don'ts

### Do:
- **Do** keep Signal Green under 10% of a screen and reserved for action and healthy states.
- **Do** use the semantic background / border / text triples together for risk and status.
- **Do** separate resting surfaces with steps and floating panels with the popover shadow.
- **Do** use Geist Mono for paths, line numbers, clause IDs, and evidence hashes.
- **Do** honour `prefers-reduced-motion`; transitions collapse to near-zero under that setting.

### Don't:
- **Don't** introduce purple, gradients, glow, or a light theme.
- **Don't** replace neutral text or dividers with green; the ladder stays carbon.
- **Don't** put a 1 px outline on resting cards to fake elevation.
- **Don't** show a score without coverage status and its contributing findings.
- **Don't** use arbitrary radii, shadows, or spacing outside the documented scales.
