import { motion } from 'framer-motion';
import { Eye, TrendingUp, Search, Wrench, FileText } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS = [
  { n: '01', Icon: Eye,        name: 'Monitor',    text: 'Watches every node for anomalies across CPU, memory, disk, network, latency and logs.' },
  { n: '02', Icon: TrendingUp, name: 'Predict',    text: 'Forecasts failure probability and time-to-failure before impact.' },
  { n: '03', Icon: Search,     name: 'Diagnose',   text: 'Finds root cause and blast radius using recall of past incidents.' },
  { n: '04', Icon: Wrench,     name: 'Remediate',  text: 'Generates an executable fix with validation steps and rollback.' },
  { n: '05', Icon: FileText,   name: 'Report',     text: 'Writes an executive summary and a runbook into institutional memory.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 px-5 py-24 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-center"
        >
          <h2 className="font-display text-[clamp(1.9rem,5vw,2.6rem)] leading-tight tracking-tight text-[var(--lp-ink)]">
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--lp-ink-soft)]">
            One pipeline, five specialists — every incident carried from first signal to a written runbook.
          </p>
        </motion.div>

        <div className="relative mt-14">
          {/* connector — desktop only, runs through the icon centers */}
          <div
            aria-hidden
            className="absolute left-[10%] right-[10%] top-[52px] hidden h-px bg-[var(--lp-line-strong)] md:block"
          />
          <ol className="relative z-10 grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.n}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                className="flex flex-col items-center text-center md:items-start md:text-left"
              >
                <span className="font-mono text-[12px] tracking-[0.2em] text-[var(--lp-ink-soft)]">
                  {s.n}
                </span>
                <span className="mt-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--lp-line-strong)] bg-[var(--lp-surface)]">
                  <s.Icon size={19} className="text-[var(--lp-blue)]" />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-[var(--lp-ink)]">{s.name}</h3>
                <p className="mt-1.5 max-w-[15rem] text-[13.5px] leading-relaxed text-[var(--lp-ink-soft)]">
                  {s.text}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
