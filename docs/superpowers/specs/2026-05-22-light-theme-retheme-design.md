# Light Theme Re-skin — ITOps Application

**Date:** 2026-05-22
**Status:** Approved design — implementing
**Branch:** `ui-experimentation`

## Goal

Switch the entire application UI from its current **warm-cream + deep-teal** "liquid
glass" system to a **cool light theme with a single blue accent**, taking its cue from
the landing page's cool, monochrome, frosted-glass language. Hallmark drives the
palette; the liquid-glass surface architecture is preserved (it echoes the landing's
frosted feel) — only recolored.

## Decision

- **Neutrals go cool** (the landing is cool white/black/glass, not warm).
- **One accent: blue `#0871E7`** — cool like the landing, the hue used in the earlier
  landing drafts, and genre-appropriate for an ops/infra tool. (Pure monochrome was
  rejected: a 9-page dashboard needs a way to signal primary actions / active state.)
- **Functional status colors stay** (green/amber/red/blue for node health, charts,
  incident severity) — desaturated to sit calmly in a light UI. The dashboard is
  unreadable without them.
- **Fonts unchanged** — Instrument Serif / Inter / JetBrains Mono (the landing uses
  Instrument Serif too).
- **Terminal/log palette stays dark** — terminal panes are dark in any theme.

## Target palette

Replaces the color values in `index.css`'s first `@theme` block.

| Token | Old (warm) | New (cool light) |
|---|---|---|
| `--color-canvas` | `#ece6d8` | `#eef0f3` |
| `--color-canvas-soft` | `#f1ebde` | `#f3f4f6` |
| `--color-surface` | `#fbf8f1` | `#fbfcfe` |
| `--color-surface-strong` | `#fffdf8` | `#ffffff` |
| `--color-ink` | `#15191a` | `#14171c` |
| `--color-ink-soft` | `#3d4341` | `#3a4049` |
| `--color-ink-mute` | `#6f7470` | `#656c77` |
| `--color-ink-faint` | `#a4a8a1` | `#9aa1ab` |
| `--color-accent` | `#244745` | `#0871e7` |
| `--color-accent-bright` | `#3a6f6a` | `#2f8af2` |
| `--color-accent-dim` | `#1b3635` | `#0a5fc0` |
| `--color-accent-glow` | `rgba(36,71,69,.18)` | `rgba(8,113,231,.18)` |
| `--color-accent-ink` | `#1c3837` | `#0a5299` |
| `--color-success` | `#3d7d65` | `#36876a` |
| `--color-warning` | `#c08a3e` | `#c0883e` (unchanged) |
| `--color-critical` | `#c5524d` | `#d0524d` |
| `--color-info` | `#3a5a7d` | `#3a6fb0` |
| `--color-hairline` | `rgba(21,25,26,.07)` | `rgba(20,24,32,.07)` |
| `--color-hairline-strong` | `rgba(21,25,26,.13)` | `rgba(20,24,32,.14)` |

The `*-ink` status text tokens (`--color-success-ink`, etc.) and the `--color-term-*`
palette are kept as-is (dark text shades + dark terminal still read fine on light).
`--color-focus-ring` becomes `rgba(8,113,231,0.55)`.

## Migration approach

**Re-skin the existing token system in place.** The app references `var(--color-*)`
widely (from the audit-fix pass), so rewriting the `@theme` color values propagates to
most of the UI automatically. The manual work is the hardcoded rgba in the glass /
global CSS and the chart palette:

1. **`index.css` — `@theme` tokens.** Rewrite the color values per the table above.
2. **`index.css` — glass + global CSS.** Recolor the hardcoded rgba via value-wise
   replacement:
   - Warm-white glass tints `255, 253, 247` → `255, 255, 255`; `252, 248, 240` →
     `248, 250, 252`; `250, 246, 237` → `247, 249, 251`; `248, 244, 234` →
     `244, 247, 250`; `255, 252, 244` → `253, 254, 255`.
   - Warm ink `21, 25, 26` → cool ink `20, 24, 32` (shadows, hairlines, scrollbar,
     selection-on-ink).
   - Teal accent `36, 71, 69` → blue `8, 113, 231` (accent-glow, focus ring,
     `pulse-accent`, `::selection`, the `liquid-glass` conic edge).
   - Body `::before` glows (teal + sand) → a subtle cool/blue wash. `::after` grain
     stays (neutral).
   - Form inputs, scrollbar, `hover-row` tint, segmented/toggle → land on cool values
     via the above replacements + token references.
3. **`lib/theme.ts`.** Rewrite the palette hex constants used by Recharts/SVG to the
   new cool/blue values: `canvas`, `surface`, `ink*`, `accent*`, `success`,
   `critical`, `info`. `term*` stays dark; `warning`/`plum` largely unchanged.
4. **Component sweep.** Grep pages/components for leftover warm hex/rgba (e.g. the
   Recharts tooltip `rgba(255,253,247,0.95)`, any `bg-[rgba(255,253,...)]` arbitrary
   classes) and update them to the cool palette / tokens.

The landing page (`pages/Landing.tsx`, `.cine-glass`) is **out of scope** — it stays
the dark cinematic hero. This re-theme is the *app shell + 9 pages*.

## Verification

- `npm run build` (tsc + vite) passes.
- ESLint introduces no new problems over the baseline (88).
- Contrast (ui-ux-pro-max CRITICAL): ink `#14171c` on canvas `#eef0f3` ≥ 12:1; white on
  accent `#0871e7` ≈ 4.6:1 (pass); ink-mute `#656c77` on canvas ≥ 4.5:1.
- Grep confirms no residual warm triplets (`255, 253, 247`, `21, 25, 26`, `36, 71, 69`)
  outside intentional spots.
- Visual pass recommended (the one thing the build can't confirm) — warm patches from
  any missed hardcoded value are the main risk.

## Out of scope

- The landing page (stays dark cinematic).
- Any layout/structure change — colors only.
- A dark-mode toggle — single light theme.
