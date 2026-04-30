import { motion } from 'framer-motion';

type Tone = { bg: string; text: string; border: string; dot: string };

const TONES: Record<string, Tone> = {
  // System / health
  healthy:    { bg: 'rgba(61,125,101,0.10)',  text: '#2d5e4c', border: 'rgba(61,125,101,0.22)', dot: '#3d7d65' },
  degraded:   { bg: 'rgba(192,138,62,0.12)',  text: '#8a6024', border: 'rgba(192,138,62,0.26)', dot: '#c08a3e' },
  critical:   { bg: 'rgba(197,82,77,0.12)',   text: '#923a36', border: 'rgba(197,82,77,0.28)',  dot: '#c5524d' },
  offline:    { bg: 'rgba(21,25,26,0.06)',    text: '#6f7470', border: 'rgba(21,25,26,0.12)',   dot: '#a4a8a1' },

  // Severities
  low:        { bg: 'rgba(61,125,101,0.10)',  text: '#2d5e4c', border: 'rgba(61,125,101,0.22)', dot: '#3d7d65' },
  medium:     { bg: 'rgba(192,138,62,0.12)',  text: '#8a6024', border: 'rgba(192,138,62,0.26)', dot: '#c08a3e' },
  high:       { bg: 'rgba(192,138,62,0.16)',  text: '#7a5320', border: 'rgba(192,138,62,0.32)', dot: '#b07a2e' },

  // Incident lifecycle
  detected:          { bg: 'rgba(58,90,125,0.10)',  text: '#2d4660', border: 'rgba(58,90,125,0.22)', dot: '#3a5a7d' },
  analyzing:         { bg: 'rgba(36,71,69,0.10)',   text: '#1c3837', border: 'rgba(36,71,69,0.22)',  dot: '#244745' },
  diagnosed:         { bg: 'rgba(102,71,116,0.10)', text: '#4d3458', border: 'rgba(102,71,116,0.22)',dot: '#664774' },
  awaiting_approval: { bg: 'rgba(192,138,62,0.12)', text: '#8a6024', border: 'rgba(192,138,62,0.26)',dot: '#c08a3e' },
  remediating:       { bg: 'rgba(36,71,69,0.10)',   text: '#1c3837', border: 'rgba(36,71,69,0.22)',  dot: '#244745' },
  resolved:          { bg: 'rgba(61,125,101,0.10)', text: '#2d5e4c', border: 'rgba(61,125,101,0.22)',dot: '#3d7d65' },
  escalated:         { bg: 'rgba(197,82,77,0.12)',  text: '#923a36', border: 'rgba(197,82,77,0.28)', dot: '#c5524d' },
  failed:            { bg: 'rgba(197,82,77,0.12)',  text: '#923a36', border: 'rgba(197,82,77,0.28)', dot: '#c5524d' },

  // Connections
  active:     { bg: 'rgba(61,125,101,0.10)',  text: '#2d5e4c', border: 'rgba(61,125,101,0.22)', dot: '#3d7d65' },
  connected:  { bg: 'rgba(61,125,101,0.10)',  text: '#2d5e4c', border: 'rgba(61,125,101,0.22)', dot: '#3d7d65' },
  configured: { bg: 'rgba(58,90,125,0.10)',   text: '#2d4660', border: 'rgba(58,90,125,0.22)',  dot: '#3a5a7d' },
  error:      { bg: 'rgba(197,82,77,0.12)',   text: '#923a36', border: 'rgba(197,82,77,0.28)',  dot: '#c5524d' },

  // Simulator statuses
  running:    { bg: 'rgba(61,125,101,0.10)',  text: '#2d5e4c', border: 'rgba(61,125,101,0.22)', dot: '#3d7d65' },
  paused:     { bg: 'rgba(192,138,62,0.12)',  text: '#8a6024', border: 'rgba(192,138,62,0.26)', dot: '#c08a3e' },
  stopped:    { bg: 'rgba(21,25,26,0.06)',    text: '#6f7470', border: 'rgba(21,25,26,0.12)',   dot: '#a4a8a1' },
  finished:   { bg: 'rgba(58,90,125,0.10)',   text: '#2d4660', border: 'rgba(58,90,125,0.22)',  dot: '#3a5a7d' },
};

export default function StatusBadge({ status, pulse = false }: { status: string; pulse?: boolean }) {
  const c = TONES[status] || TONES.detected;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11px] font-medium"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        letterSpacing: '0.01em',
      }}
    >
      <motion.span
        className="w-[6px] h-[6px] rounded-full"
        style={{ background: c.dot }}
        animate={pulse ? { scale: [1, 1.35, 1], opacity: [1, 0.7, 1] } : undefined}
        transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
