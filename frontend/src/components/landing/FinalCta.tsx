import { motion } from 'framer-motion';
import CtaButton from './CtaButton';

const EASE = [0.16, 1, 0.3, 1] as const;

export default function FinalCta() {
  return (
    <section className="border-t border-[var(--lp-line)] px-5 py-28 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mx-auto flex max-w-2xl flex-col items-center text-center"
      >
        <h2 className="font-display text-[clamp(2.1rem,6vw,3.4rem)] leading-[1.02] tracking-tight text-[var(--lp-ink)]">
          Stop firefighting.<br />Start orchestrating.
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--lp-ink-soft)]">
          Step into the live console — fleet health, the agent pipeline, and Argus, all in one place.
        </p>
        <div className="mt-8">
          <CtaButton label="Enter the app" size="lg" />
        </div>
      </motion.div>
    </section>
  );
}
