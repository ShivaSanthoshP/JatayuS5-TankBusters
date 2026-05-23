import { useReducedMotion } from 'framer-motion';

/**
 * Live audio waveform — accent-coloured vertical bars whose heights ride the
 * FFT bins coming out of `useVoiceInput`. `compact` shrinks it to an inline
 * "still listening" indicator that sits inside the chat input pill next to the
 * live transcript.
 */
export default function VoiceWave({ bars, compact = false }: { bars: number[]; compact?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div
      className={`flex items-center justify-center ${compact ? 'gap-1 h-5 shrink-0 px-1' : 'gap-1.5 h-9'}`}
      aria-hidden
    >
      {bars.map((v, i) => {
        // Light gain + a 16% floor so even silence shows a faint resting bar.
        const h = reduce ? 0.32 : Math.max(0.16, Math.min(1, v * 2.4));
        return (
          <span
            key={i}
            className={`block rounded-full bg-accent ${compact ? 'w-1' : 'w-1.5'}`}
            style={{
              height: `${h * 100}%`,
              transition: reduce ? 'none' : 'height 70ms linear',
            }}
          />
        );
      })}
    </div>
  );
}
