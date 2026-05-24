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
  canvas:       '#ffffff',
  canvasSoft:   '#f4f6fa',
  surface:      '#ffffff',
  surfaceStrong:'#ffffff',

  ink:          '#15191a',
  inkSoft:      '#3d4341',
  inkMute:      '#6f7470',
  inkFaint:     '#a4a8a1',

  accent:       '#35358c',
  accentBright: '#4646b8',
  accentDim:    '#2b2d61',
  accentInk:    '#2b2d61',

  /* Electric "spark" — Virtusa green, used very sparingly. */
  spark:        '#01f965',

  success:      '#3d7d65',
  successInk:   '#2d5e4c',
  warning:      '#c08a3e',
  warningStrong:'#b07a2e',
  warningInk:   '#8a6024',
  critical:     '#c5524d',
  criticalInk:  '#923a36',
  info:         '#3a5a7d',
  infoInk:      '#2d4660',

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
