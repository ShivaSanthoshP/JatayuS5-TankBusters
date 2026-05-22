/**
 * Palette constants — the single source of truth for colours that must be
 * passed as plain strings to contexts where CSS custom properties do NOT
 * resolve: SVG presentation attributes (`stroke`, `fill`) and charting libs
 * like Recharts that set attributes rather than CSS properties.
 *
 * These mirror the `@theme` tokens in `index.css` 1:1. For ordinary inline
 * styles (`background`, `color`, `border`) use `var(--color-*)` directly —
 * only reach for this module when a literal colour string is unavoidable.
 */
export const palette = {
  canvas:       '#eef0f3',
  canvasSoft:   '#f3f4f6',
  surface:      '#fbfcfe',
  surfaceStrong:'#ffffff',

  ink:          '#14171c',
  inkSoft:      '#3a4049',
  inkMute:      '#656c77',
  inkFaint:     '#9aa1ab',

  accent:       '#0871e7',
  accentBright: '#2f8af2',
  accentDim:    '#0a5fc0',
  accentInk:    '#0a5299',

  success:      '#36876a',
  successInk:   '#2d6e57',
  warning:      '#c0883e',
  warningStrong:'#b07a2e',
  warningInk:   '#8a6024',
  critical:     '#d0524d',
  criticalInk:  '#a23a37',
  info:         '#3a6fb0',
  infoInk:      '#2d5285',

  /* Categorical accent for data-viz / agent / source encoding. */
  plum:         '#664774',

  /* Terminal / log palette — bright-on-dark, for .terminal-pane surfaces. */
  termBg:       '#0e1112',
  termBgSoft:   '#13171a',
  termInk:      '#cfd6da',
  termInkMute:  '#9aa6ab',
  termInkFaint: '#5b6770',
  termInfo:     '#7fb3a3',
  termMint:     '#9fcab9',
  termWarn:     '#dba94f',
  termCritical: '#e0726c',
  termDebug:    '#7fa3c4',
} as const;

/** Map a node/incident health tone to its palette colour. */
export function toneColor(tone: 'healthy' | 'degraded' | 'critical' | string): string {
  switch (tone) {
    case 'healthy': return palette.success;
    case 'degraded': return palette.warning;
    case 'critical': return palette.critical;
    default: return palette.success;
  }
}
