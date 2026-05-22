import { motion } from 'framer-motion';

/**
 * Animated three-dot "thinking" indicator, shown inside an assistant bubble
 * while Argus is working but hasn't streamed any text yet. The motion is what
 * distinguishes it from real output — a static "…" reads as content.
 */
export default function TypingIndicator() {
  return (
    <span
      role="status"
      aria-label="Argus is thinking"
      className="flex items-center gap-1 py-1"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-ink-mute"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2.5, 0] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.16,
          }}
        />
      ))}
    </span>
  );
}
