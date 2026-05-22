import { motion, useReducedMotion } from 'framer-motion';

/**
 * Each status maps to a base hue + its readable "ink" text shade — both
 * pulled from the @theme tokens in index.css (no inline hex). Background and
 * border are derived from the base via color-mix, so the whole badge stays
 * sourced from the design system.
 */
type Tone = { base: string; ink: string; dot?: string };

const STRONG = 'var(--color-warning-strong)';
const NEUTRAL: Tone = { base: 'var(--color-ink)', ink: 'var(--color-ink-mute)', dot: 'var(--color-ink-faint)' };

const TONES: Record<string, Tone> = {
  // System / health
  healthy:    { base: 'var(--color-success)',  ink: 'var(--color-success-ink)' },
  degraded:   { base: 'var(--color-warning)',  ink: 'var(--color-warning-ink)' },
  critical:   { base: 'var(--color-critical)', ink: 'var(--color-critical-ink)' },
  offline:    NEUTRAL,

  // Severities
  low:        { base: 'var(--color-success)',  ink: 'var(--color-success-ink)' },
  medium:     { base: 'var(--color-warning)',  ink: 'var(--color-warning-ink)' },
  high:       { base: STRONG, ink: 'var(--color-warning-ink-strong)', dot: STRONG },

  // Incident lifecycle
  detected:          { base: 'var(--color-info)',    ink: 'var(--color-info-ink)' },
  analyzing:         { base: 'var(--color-accent)',  ink: 'var(--color-accent-ink)' },
  diagnosed:         { base: 'var(--color-info)',    ink: 'var(--color-info-ink)' },
  awaiting_approval: { base: 'var(--color-warning)', ink: 'var(--color-warning-ink)' },
  remediating:       { base: 'var(--color-accent)',  ink: 'var(--color-accent-ink)' },
  resolved:          { base: 'var(--color-success)', ink: 'var(--color-success-ink)' },
  escalated:         { base: 'var(--color-critical)',ink: 'var(--color-critical-ink)' },
  failed:            { base: 'var(--color-critical)',ink: 'var(--color-critical-ink)' },

  // Connections
  active:     { base: 'var(--color-success)', ink: 'var(--color-success-ink)' },
  connected:  { base: 'var(--color-success)', ink: 'var(--color-success-ink)' },
  configured: { base: 'var(--color-info)',    ink: 'var(--color-info-ink)' },
  error:      { base: 'var(--color-critical)',ink: 'var(--color-critical-ink)' },

  // Simulator statuses
  running:    { base: 'var(--color-success)', ink: 'var(--color-success-ink)' },
  paused:     { base: 'var(--color-warning)', ink: 'var(--color-warning-ink)' },
  stopped:    NEUTRAL,
  finished:   { base: 'var(--color-info)',    ink: 'var(--color-info-ink)' },
};

export default function StatusBadge({ status, pulse = false }: { status: string; pulse?: boolean }) {
  const reduce = useReducedMotion();
  const t = TONES[status] || TONES.detected;
  const tintPct = t === NEUTRAL ? 6 : 12;
  const borderPct = t === NEUTRAL ? 12 : 26;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11px] font-medium"
      style={{
        background: `color-mix(in srgb, ${t.base} ${tintPct}%, transparent)`,
        color: t.ink,
        border: `1px solid color-mix(in srgb, ${t.base} ${borderPct}%, transparent)`,
        letterSpacing: '0.01em',
      }}
    >
      <motion.span
        className="w-[6px] h-[6px] rounded-full"
        style={{ background: t.dot ?? t.base }}
        animate={pulse && !reduce ? { scale: [1, 1.35, 1], opacity: [1, 0.7, 1] } : undefined}
        transition={pulse && !reduce ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
