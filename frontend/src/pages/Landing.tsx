/* Hallmark · macrostructure: Marquee Hero · genre: atmospheric → modern-minimal
 * theme: iTOps brand (preserved · indigo accent + spark green on white) · enrichment: E0 aurora
 * tone: business proposal — impactful, restrained, honest copy (README facts only)
 * motion: aurora · fadeUp · stagger
 * route: / (and /landing alias) · standalone (no app navbar)
 * pre-emit critique: P5 H5 E4 S5 R5 V4
 */
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Activity, TrendingUp, Search, Wrench,
  FileText, Wand2, ShieldCheck, Cpu, Cloud, Database, Code2,
} from 'lucide-react';
import { useRef } from 'react';
import { AuroraBackground } from '@/components/ui/aurora-background';

// The landing page now lives on the same domain as the app, so every
// "open the platform" CTA is an internal SPA navigation. /app is the
// dashboard route — kept short so the URL stays clean.
const APP_PATH = '/app';
const REPO_URL = 'https://github.com/ShivaSanthoshP/itops';

const AGENTS = [
  { Icon: Activity,   label: 'Monitor',    role: 'Real-time anomaly detection — CPU, memory, disk, network, latency, error rate, correlated with live log signals.' },
  { Icon: TrendingUp, label: 'Predict',    role: 'Failure-probability forecasting, time-to-failure estimation, escalation and cascade-risk scoring.' },
  { Icon: Search,     label: 'Diagnose',   role: 'Root-cause analysis with causal-chain mapping, blast-radius assessment, and RAG over past incidents.' },
  { Icon: Wrench,     label: 'Remediate',  role: 'Generates reviewable, runnable shell scripts with validation steps and explicit rollback commands.' },
  { Icon: FileText,   label: 'Report',     role: 'Executive summary, incident timeline, SLA impact, and an auto-generated runbook written back to memory.' },
] as const;

const DEPTH = [
  'Audit-logged Argus actions',
  'Per-turn idempotency on mutating tools',
  'Confirmation cards before risky writes',
  'Bounded async dispatch (no unbounded coroutines)',
  'Timeout-bounded LangGraph nodes',
  'Graceful degradation to deterministic defaults',
  'S3-backed durable ChromaDB',
  'Root-only EnvironmentFile for secrets',
  'IMDSv2 required',
  'gzip + immutable cache on hashed assets',
];

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroParallax = useTransform(scrollYProgress, [0, 1], ['0%', '15%']);

  return (
    <main className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative">
        <AuroraBackground className="min-h-[100vh] py-24 sm:py-32">
          <motion.div
            style={{ y: heroParallax }}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-[1] mx-auto max-w-[1100px] px-6 sm:px-10"
          >
            {/* Eyebrow + live badge — sit above the headline so the hero
                doesn't start with "yet another marketing page". */}
            <div className="flex items-center gap-3 mb-7 flex-wrap">
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10.5px] font-mono uppercase tracking-[0.18em] text-[var(--color-ink-soft)]"
                style={{
                  background: 'rgba(255,255,255,0.78)',
                  boxShadow: 'inset 0 0 0 1px rgba(21,25,26,0.10), 0 8px 20px -10px rgba(21,25,26,0.18)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                Team Tank Busters · Autonomous AIOps
              </span>
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10.5px] font-mono uppercase tracking-[0.18em]"
                style={{
                  background: 'rgba(255,255,255,0.78)',
                  color: '#0a6b2e',
                  boxShadow: 'inset 0 0 0 1px rgba(1,249,101,0.45), 0 0 0 4px rgba(1,249,101,0.10)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-spark)] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-spark)]" />
                </span>
                AWS CloudWatch · connected · live
              </span>
            </div>

            <h1
              className="font-display font-semibold leading-[0.95] tracking-[-0.02em] text-[44px] sm:text-[72px] md:text-[96px] lg:text-[112px] text-[var(--color-ink)]"
              style={{ overflowWrap: 'anywhere' }}
            >
              Infrastructure that{' '}
              <span className="italic text-[var(--color-accent)]">heals itself.</span>
            </h1>

            <p className="mt-8 max-w-[58ch] text-[16px] sm:text-[19px] leading-[1.55] text-[var(--color-ink-soft)]">
              Five autonomous AI agents and a conversational copilot —{' '}
              <span className="font-semibold text-[var(--color-ink)]">Argus</span> — watch your fleet,
              predict failures before they land, diagnose root cause, and draft safe fixes. So
              infrastructure heals itself, and on-call engineers get their nights back.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to={APP_PATH}
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-semibold text-[var(--color-surface)]"
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.28), 0 14px 36px -10px var(--color-accent-glow), 0 4px 10px -2px rgba(0,0,0,0.20)',
                }}
              >
                Open the live platform
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
              <a
                href="#how"
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-semibold text-[var(--color-ink)] bg-white/85 backdrop-blur ring-1 ring-[rgba(21,25,26,0.10)] hover:bg-white transition-colors"
              >
                See how it works
                <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>

            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6 max-w-[640px] text-[11.5px] font-mono uppercase tracking-[0.14em] text-[var(--color-ink-mute)]">
              <span>5 autonomous agents</span>
              <span>24 Argus tools</span>
              <span>LangGraph orchestrated</span>
              <span>RAG · ChromaDB memory</span>
            </div>
          </motion.div>
        </AuroraBackground>
      </section>

      {/* ── COST OF THE 3 AM PAGE — editorial pull-quote ─────── */}
      <section id="how" className="relative px-6 sm:px-10 py-28 sm:py-36">
        <div className="mx-auto max-w-[1100px] grid lg:grid-cols-[1fr_1.6fr] gap-12 lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-[var(--color-ink-mute)]">
              The status quo
            </span>
            <h2 className="mt-3 font-display font-semibold text-[36px] sm:text-[48px] leading-[1.02] tracking-[-0.015em]">
              The 3 AM page is a <span className="text-[var(--color-accent)]">human problem</span> dressed up as a metric.
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="space-y-7 text-[16px] sm:text-[17px] leading-[1.65] text-[var(--color-ink-soft)]"
          >
            <p>
              A dozen siloed monitors all fire at once — none of them coordinate, and the on-call
              engineer drowns in <strong className="text-[var(--color-ink)]">alert fatigue</strong> before the real
              signal surfaces.
            </p>
            <p>
              Triage is manual archaeology: scroll dashboards, grep logs, hunt Slack for whoever
              last touched this service, dig through a runbook that's six months stale.
            </p>
            <p>
              A trivial fix that took five minutes last quarter takes forty-five tonight, because{' '}
              <strong className="text-[var(--color-ink)]">no system remembers</strong> how it was solved.
              Institutional knowledge walks out the door with every engineer who leaves.
            </p>
            <p className="pt-4 border-t border-[rgba(21,25,26,0.08)] text-[var(--color-ink-mute)] text-[14px] italic">
              One AI model alone can't fix this. Detecting an anomaly, forecasting a failure,
              reasoning about root cause, and producing a <em>safe</em> remediation are
              fundamentally different cognitive tasks. They need specialised agents that
              collaborate — an agentic architecture.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── THE FIVE AGENTS + ARGUS ──────────────────────────── */}
      <section className="relative px-6 sm:px-10 py-24 sm:py-32 bg-[var(--color-canvas-soft)]">
        <div className="mx-auto max-w-[1200px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[760px]"
          >
            <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-[var(--color-ink-mute)]">
              The architecture
            </span>
            <h2 className="mt-3 font-display font-semibold text-[36px] sm:text-[52px] leading-[1.02] tracking-[-0.015em]">
              Five autonomous agents. One copilot.
            </h2>
            <p className="mt-5 text-[16px] leading-[1.65] text-[var(--color-ink-soft)] max-w-[60ch]">
              The agents run as nodes in a LangGraph state machine. Common failure modes resolve
              instantly through pre-approved profiles; novel anomalies invoke an LLM with RAG
              context retrieved from the highest-rated past incidents. Each resolution becomes a
              runbook the agents reuse next time.
            </p>
          </motion.div>

          {/* Agent pipeline strip */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {AGENTS.map(({ Icon, label, role }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-10%' }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
                className="relative rounded-2xl bg-white p-5 ring-1 ring-[rgba(21,25,26,0.08)]"
                style={{ boxShadow: '0 1px 2px rgba(21,25,26,0.03), 0 16px 36px -22px rgba(21,25,26,0.18)' }}
              >
                <span className="absolute top-4 right-4 text-[10px] font-mono text-[var(--color-ink-faint)]">
                  0{i + 1}
                </span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%)',
                  }}
                >
                  <Icon size={18} className="text-white" />
                </div>
                <h3 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.01em]">
                  {label}
                </h3>
                <p className="mt-2 text-[12.5px] leading-[1.55] text-[var(--color-ink-soft)]">{role}</p>
              </motion.div>
            ))}
          </div>

          {/* Argus pull-out — visually distinct from the 5-agent row */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="mt-6 relative overflow-hidden rounded-2xl px-6 py-8 sm:px-10 sm:py-10"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent-bright) 0%, var(--color-accent) 50%, var(--color-accent-dim) 100%)',
              boxShadow: '0 22px 50px -20px rgba(28,28,74,0.55)',
            }}
          >
            <Wand2
              aria-hidden
              size={170}
              className="pointer-events-none absolute -right-6 -bottom-10 text-white/[0.06]"
            />
            <div className="relative grid md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-center">
              <div>
                <span className="text-[10.5px] font-mono uppercase tracking-[0.22em]" style={{ color: 'var(--color-spark)' }}>
                  Meet Argus
                </span>
                <h3 className="mt-2 font-display font-semibold text-[28px] sm:text-[36px] leading-[1.05] tracking-[-0.015em] text-white">
                  The conversational copilot for the whole platform.
                </h3>
                <p className="mt-3 max-w-[58ch] text-[14px] sm:text-[15px] leading-[1.6]" style={{ color: 'rgba(255,255,255,0.86)' }}>
                  Argus is backed by 24 real tools — fleet health, metrics, logs, incidents, the
                  agent pipeline, runbooks, data sources, simulators, and settings. Type or speak;
                  it reads live state and performs operations on your behalf. Risky actions pause
                  on a confirmation card. Every call is audit-logged and idempotent per turn.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['24 tools', 'voice + text', 'confirm before risky writes', 'audit log', 'idempotent per turn'].map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
                      style={{
                        color: 'rgba(255,255,255,0.86)',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.14)',
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <Link
                to="/copilot"
                className="group inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13px] font-semibold whitespace-nowrap shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-canvas-soft) 100%)',
                  color: 'var(--color-accent-dim)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 24px -8px rgba(0,0,0,0.42)',
                }}
              >
                Talk to Argus
                <ArrowRight
                  size={15}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── LIVE ON REAL AWS ─────────────────────────────────── */}
      <section className="relative px-6 sm:px-10 py-28 sm:py-36">
        <div className="mx-auto max-w-[1100px] grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-start">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-[var(--color-ink-mute)]">
              Live, not mocked
            </span>
            <h2 className="mt-3 font-display font-semibold text-[34px] sm:text-[48px] leading-[1.02] tracking-[-0.015em]">
              It watches the infrastructure it lives on.
            </h2>
            <p className="mt-5 text-[16px] leading-[1.65] text-[var(--color-ink-soft)] max-w-[58ch]">
              The platform is connected to a real AWS account in Mumbai (
              <span className="font-mono text-[14px]">ap-south-1</span>) and is actively monitoring
              the production EC2 host it runs on. It reads that instance's live metrics straight
              from CloudWatch, tails its real log groups, and runs the full five-agent pipeline
              against what it observes. The orchestrator would diagnose and draft a fix for its
              own host the moment anything drifts.
            </p>
          </motion.div>

          <motion.dl
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-15%' }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06 } },
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {[
              { Icon: Cloud,       label: 'Provider',         value: 'AWS CloudWatch — connected' },
              { Icon: Cpu,         label: 'Region',           value: 'Mumbai · ap-south-1' },
              { Icon: ShieldCheck, label: 'Monitored target', value: 'Production EC2 host (self)' },
              { Icon: Database,    label: 'Memory',           value: 'ChromaDB on S3-backed mount' },
            ].map(({ Icon, label, value }) => (
              <motion.div
                key={label}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-xl bg-white p-4 ring-1 ring-[rgba(21,25,26,0.08)]"
                style={{ boxShadow: '0 1px 2px rgba(21,25,26,0.03), 0 10px 22px -16px rgba(21,25,26,0.16)' }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-[var(--color-accent)]" />
                  <dt className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-[var(--color-ink-mute)]">
                    {label}
                  </dt>
                </div>
                <dd className="mt-2 font-display text-[15px] text-[var(--color-ink)]">{value}</dd>
              </motion.div>
            ))}
          </motion.dl>
        </div>
      </section>

      {/* ── ENGINEERING DEPTH — pill list ─────────────────────── */}
      <section className="relative px-6 sm:px-10 pb-28 sm:pb-32">
        <div className="mx-auto max-w-[1100px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[760px]"
          >
            <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-[var(--color-ink-mute)]">
              Under the hood
            </span>
            <h2 className="mt-3 font-display font-semibold text-[34px] sm:text-[44px] leading-[1.05] tracking-[-0.015em]">
              Built with the boring discipline of a real production system.
            </h2>
          </motion.div>

          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10%' }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
            className="mt-9 flex flex-wrap gap-2"
          >
            {DEPTH.map((label) => (
              <motion.li
                key={label}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="text-[12.5px] px-3.5 py-2 rounded-full bg-white ring-1 ring-[rgba(21,25,26,0.10)] text-[var(--color-ink-soft)]"
              >
                {label}
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── FINAL CTA + TEAM ─────────────────────────────────── */}
      <section className="relative px-6 sm:px-10 pb-32 sm:pb-40">
        <div className="mx-auto max-w-[1100px]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl px-6 py-14 sm:px-12 sm:py-20 text-center"
            style={{
              background: 'linear-gradient(180deg, var(--color-surface) 0%, var(--color-canvas-soft) 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(21,25,26,0.06), 0 30px 60px -28px rgba(21,25,26,0.20)',
            }}
          >
            <h2 className="font-display font-semibold text-[36px] sm:text-[60px] leading-[1.02] tracking-[-0.02em] max-w-[24ch] mx-auto">
              The 3 AM page becomes a <span className="italic text-[var(--color-accent)]">non-event.</span>
            </h2>
            <p className="mt-6 max-w-[60ch] mx-auto text-[15px] sm:text-[16px] leading-[1.6] text-[var(--color-ink-soft)]">
              Handled, documented, and already understood by the time anyone wakes up. Every
              incident the platform resolves makes it smarter. The knowledge base grows itself.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={APP_PATH}
                className="group inline-flex items-center gap-2 rounded-full px-7 py-4 text-[15px] font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30), 0 18px 40px -10px var(--color-accent-glow), 0 6px 14px -2px rgba(0,0,0,0.20)',
                }}
              >
                Open the live platform
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-[13.5px] font-semibold text-[var(--color-ink)] bg-white ring-1 ring-[rgba(21,25,26,0.12)] hover:bg-[var(--color-canvas-soft)] transition-colors"
              >
                <Code2 size={15} />
                Read the code on GitHub
              </a>
            </div>
          </motion.div>

          {/* Team byline */}
          <div className="mt-16 text-center">
            <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-[var(--color-ink-mute)]">
              Built by
            </span>
            <h3 className="mt-2 font-display text-[20px] font-semibold text-[var(--color-ink)]">
              Team Tank Busters
            </h3>
            <p className="mt-1 text-[14px] text-[var(--color-ink-soft)]">
              P. Shiva Santhosh · N. S. J. S. Dhanush · P. Shikhar
            </p>
            <p className="mt-6 text-[12.5px] italic text-[var(--color-ink-mute)] max-w-[52ch] mx-auto">
              For the future of autonomous IT operations — where infrastructure heals itself, and
              the people who run it finally get to rest.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
