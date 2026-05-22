import { motion } from 'framer-motion';
import { Radar, Database, Cloud, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

type Feature = { Icon: LucideIcon; title: string; body: string; span: string; chips?: string[] };

const FEATURES: Feature[] = [
  {
    Icon: Radar,
    title: 'Predictive, not reactive',
    body: 'Forecasts failure probability and time-to-failure, so the fix lands before the page fires — not after.',
    span: 'md:col-span-7',
  },
  {
    Icon: Database,
    title: 'Institutional memory',
    body: 'Every resolved incident is recalled to make the next one faster. The platform learns as it runs.',
    span: 'md:col-span-5',
  },
  {
    Icon: Cloud,
    title: 'Multi-cloud by design',
    body: 'Pluggable data sources, switchable at runtime — no agent rewrite to add a provider.',
    span: 'md:col-span-5',
    chips: ['AWS', 'GCP', 'Azure', 'Prometheus', 'Docker'],
  },
  {
    Icon: ShieldCheck,
    title: 'Human-in-the-loop',
    body: 'Low-risk fixes auto-apply; high and critical changes pause at an approval checkpoint for your call.',
    span: 'md:col-span-7',
  },
];

export default function Features() {
  return (
    <section className="px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="max-w-xl"
        >
          <h2 className="font-display text-[clamp(1.9rem,5vw,2.6rem)] leading-tight tracking-tight text-[var(--lp-ink)]">
            Built to stay ahead
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-ink-soft)]">
            The difference between an alert and an outage is whatever happens in the next ten minutes.
          </p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-12">
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.07, ease: EASE }}
              className={`${f.span} flex flex-col rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-7`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--lp-blue)]/10">
                <f.Icon size={19} className="text-[var(--lp-blue)]" />
              </span>
              <h3 className="mt-5 font-display text-[22px] leading-snug tracking-tight text-[var(--lp-ink)]">
                {f.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-ink-soft)]">{f.body}</p>
              {f.chips && (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {f.chips.map((c) => (
                    <li
                      key={c}
                      className="rounded-md border border-[var(--lp-line)] px-2 py-1 font-mono text-[11px] text-[var(--lp-ink-soft)]"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
