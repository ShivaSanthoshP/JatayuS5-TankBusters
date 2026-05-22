import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Eye, ArrowRight } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

export default function ArgusSection() {
  return (
    <section className="px-5 py-24 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mx-auto grid max-w-5xl items-center gap-8 rounded-3xl bg-[var(--lp-ink)] p-8 sm:gap-10 sm:p-12 md:grid-cols-2"
      >
        {/* Copy */}
        <div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--lp-blue)]">
            <Eye size={20} className="text-white" />
          </span>
          <h2 className="mt-5 font-display text-[clamp(1.9rem,4.6vw,2.6rem)] leading-[1.08] tracking-tight text-[var(--lp-bg)]">
            Meet Argus — your fleet copilot.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--lp-bg)]/65">
            Ask your infrastructure anything in plain English. Argus reads live
            telemetry, runs the pipeline, and explains exactly what it found.
          </p>
          <Link
            to="/copilot"
            className="group mt-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-full
              border border-white/20 px-5 text-[14px] font-medium text-[var(--lp-bg)] whitespace-nowrap
              transition-colors duration-200 hover:bg-white/[0.08]"
          >
            Open Argus
            <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Sample exchange */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-mono text-[12.5px] leading-relaxed sm:p-6 sm:text-[13px]">
          <p className="text-[var(--lp-bg)]">
            <span className="text-[var(--lp-blue)]">ask argus ▸</span> why is api-gw-3 degraded?
          </p>
          <p className="mt-3 text-[var(--lp-bg)]/55">
            Connection pool exhausted under a memory leak. Predicted failure in
            ~6&nbsp;min — remediation generated, rollback armed, awaiting your approval.
          </p>
        </div>
      </motion.div>
    </section>
  );
}
