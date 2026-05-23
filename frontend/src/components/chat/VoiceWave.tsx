import { useReducedMotion } from 'framer-motion';

/**
 * Live audio waveform — five accent-coloured vertical bars whose heights ride
 * the FFT bins coming out of `useVoiceInput`. Shown in the chat input pill
 * while the mic is open.
 */
export default function VoiceWave({ bars }: { bars: number[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center justify-center gap-1.5 h-9" aria-hidden>
      {bars.map((v, i) => {
        // Light gain + a 16% floor so even silence shows a faint resting bar.
        const h = reduce ? 0.32 : Math.max(0.16, Math.min(1, v * 2.4));
        return (
          <span
            key={i}
            className="block w-1.5 rounded-full bg-accent"
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
