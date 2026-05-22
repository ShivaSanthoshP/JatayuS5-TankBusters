import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wand2, ArrowRight } from 'lucide-react';
import { spring, fadeUp } from '../lib/motion';

/**
 * Dashboard feature-promo banner for Argus, the SRE assistant. A deep-teal
 * gradient card — the only dark card on an otherwise cream Dashboard, so it
 * reads as an advertisement. The whole card is one Link to /copilot.
 */
const CAPABILITIES = ['Diagnose', 'Remediate', 'Explain'];

export default function CopilotPromo() {
  return (
    <motion.div variants={fadeUp}>
      <Link
        to="/copilot"
        aria-label="Open Argus, the fleet chat assistant"
        className="group block rounded-[22px] outline-none
          focus-visible:ring-2 focus-visible:ring-[var(--color-warning)]
          focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-canvas)]"
      >
        <motion.div
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.992 }}
          transition={spring.smooth}
          className="liquid-glass relative overflow-hidden rounded-[22px] gpu
            px-5 py-5 sm:px-7 sm:py-6 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent-bright) 0%, var(--color-accent) 46%, var(--color-accent-dim) 100%)',
            boxShadow: '0 18px 40px -18px rgba(27,54,53,0.65)',
          }}
        >
          {/* Oversized watermark mark, clipped by the card — no floating orbs. */}
          <Wand2
            aria-hidden
            size={130}
            className="pointer-events-none absolute -right-5 -bottom-8 text-white/[0.045]"
          />

          <div className="relative z-[1] flex flex-col md:flex-row md:items-center gap-5 md:gap-6">
            {/* Glowing icon badge */}
            <div
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--color-warning) 0%, var(--color-warning-ink-strong) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.38), 0 8px 22px -6px rgba(192,138,62,0.6)',
              }}
            >
              <Wand2 size={22} className="text-[var(--color-surface)]" />
            </div>

            {/* Copy */}
            <div className="flex-1 min-w-0">
              <span className="label-eyebrow !text-[9.5px]" style={{ color: 'rgba(222,182,124,0.95)' }}>
                Meet Argus
              </span>
              <h2 className="font-display text-[20px] sm:text-[25px] leading-[1.16] mt-1.5 text-[var(--color-surface)]">
                Stop reading dashboards. Start asking Argus.
              </h2>
              <p className="text-[12.5px] sm:text-[13px] leading-relaxed mt-2 max-w-[64ch]"
                style={{ color: 'rgba(251,248,241,0.74)' }}>
                Nothing on your fleet goes unwatched — Argus reads live telemetry,
                runs the five-agent pipeline, and resolves incidents.
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {CAPABILITIES.map((c) => (
                  <span
                    key={c}
                    className="text-[9px] font-mono uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                    style={{
                      color: 'rgba(251,248,241,0.82)',
                      background: 'rgba(251,248,241,0.07)',
                      border: '1px solid rgba(251,248,241,0.13)',
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA pill — visual affordance; the whole card is the link */}
            <div className="shrink-0 md:self-center">
              <span
                className="inline-flex items-center justify-center gap-2 w-full md:w-auto
                  rounded-full px-4 py-2.5 font-display text-[13px] text-[var(--color-accent-dim)] whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-canvas) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 8px 20px -8px rgba(0,0,0,0.45)',
                }}
              >
                Ask Argus
                <ArrowRight
                  size={15}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </span>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
