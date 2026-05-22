import { motion, useReducedMotion } from 'framer-motion';
import HeroTerminal from './HeroTerminal';
import CtaButton from './CtaButton';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_054418_a6d194f0-ac86-4df9-abe5-ded73e596d7c.mp4';
const EASE = [0.16, 1, 0.3, 1] as const;

export default function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center overflow-hidden bg-[var(--lp-bg)] px-5 pb-20 pt-28 sm:pt-36">
      {/* Ambient video — paused for reduced-motion users */}
      <video
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src={VIDEO_SRC}
        autoPlay={!reduce}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Tint — keeps text legible and fades the video into the page */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 bg-gradient-to-b from-[var(--lp-bg)]/88 via-[var(--lp-bg)]/55 to-[var(--lp-bg)]"
      />

      {/* Copy */}
      <div className="relative z-10 w-full max-w-3xl text-center">
        <motion.h1
          initial={reduce ? false : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: EASE }}
          className="font-display text-[clamp(2.5rem,8.5vw,4.75rem)] leading-[0.95] tracking-tight text-[var(--lp-ink)]"
          style={{ overflowWrap: 'anywhere' }}
        >
          Infrastructure<br />that heals itself.
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
          className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-[var(--lp-ink-soft)] sm:text-[17px]"
        >
          Five autonomous AI agents that monitor, predict, diagnose, and remediate
          failures across your multi-cloud fleet — in real time, with memory of every incident.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: EASE }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <CtaButton />
          <a
            href="#how"
            className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full border border-[var(--lp-line-strong)]
              bg-[var(--lp-surface)]/60 px-5 text-[15px] font-medium text-[var(--lp-ink)] whitespace-nowrap
              backdrop-blur-sm transition-colors duration-200 hover:bg-[var(--lp-surface)]"
          >
            See how it works
          </a>
        </motion.div>
      </div>

      {/* Terminal centerpiece */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.7, ease: EASE }}
        className="relative z-10 mt-14 w-full max-w-2xl sm:mt-16"
      >
        <HeroTerminal />
      </motion.div>
    </section>
  );
}
