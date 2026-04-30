import { motion } from 'framer-motion';
import {
  Eye, TrendingUp, Search, Wrench, FileText
} from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import Loader from '../components/ui/Loader';
import { useApi } from '../hooks/useApi';
import * as api from '../services/api';
import type { AgentInfo } from '../types';

const AGENT_ICONS: Record<string, React.ElementType> = {
  monitoring: Eye,
  predictive: TrendingUp,
  diagnostic: Search,
  remediation: Wrench,
  reporting: FileText,
};

const AGENT_GLOW: Record<string, string> = {
  monitoring: '#10b981', // emerald
  predictive: '#0ea5e9', // sky
  diagnostic: '#8b5cf6', // violet
  remediation: '#f59e0b', // amber
  reporting: '#3b82f6', // blue
};

const PIPELINE_STEPS = ['monitoring', 'predictive', 'diagnostic', 'remediation', 'reporting'];

const AGENT_DETAILS: Record<string, { title: string, role: string, overview: string, highlights: string[] }> = {
  monitoring: {
    title: 'Monitoring Agent',
    role: 'Phase 1 • Observation',
    overview: 'The pipeline begins here. The Monitoring Agent acts as a continuous sentinel, constantly ingesting infrastructure metrics and log streams. By combining statistical baselining with LLM-powered context awareness, it rapidly identifies genuine anomalies while actively suppressing false positives and alert fatigue.',
    highlights: ['Real-time Log Tailing', 'Anomaly Detection', 'Noise Suppression']
  },
  predictive: {
    title: 'Predictive Agent',
    role: 'Phase 2 • Forecasting',
    overview: 'Once an anomaly is detected, the Predictor analyzes its historical trajectory. By projecting current degradation rates (such as memory leaks or disk filling), it precisely calculates the Estimated Time to Failure (TTF), allowing the system to prioritize its intervention urgency.',
    highlights: ['Trend Analysis', 'TTF Calculation', 'Risk Assessment']
  },
  diagnostic: {
    title: 'Diagnostic Agent',
    role: 'Phase 3 • Root Cause Analysis',
    overview: 'This is the reasoning engine of the pipeline. Utilizing RAG (Retrieval-Augmented Generation) against a massive database of past incident tickets and institutional runbooks, it deduces the exact underlying cause of the forecasted failure and prepares a human-readable diagnostic hypothesis.',
    highlights: ['Causal Reasoning', 'RAG Contextualization', 'Hypothesis Generation']
  },
  remediation: {
    title: 'Remediation Agent',
    role: 'Phase 4 • Action Synthesis',
    overview: 'Equipped with a diagnosis, the Remediation Agent autonomously synthesizes code to fix the issue. Whether it requires writing bash scripts, rolling back a deployment, or optimizing database queries, it formulates the exact commands needed—always paired with a safety-first rollback strategy.',
    highlights: ['Script Synthesis', 'Canary Rollouts', 'Auto-Rollbacks']
  },
  reporting: {
    title: 'Reporting Agent',
    role: 'Phase 5 • Post-Mortem',
    overview: 'The final step of the sequence. After the system is stabilized, the Reporter compiles the entire autonomous intervention into a highly detailed, chronological post-mortem. It automatically archives the resolution as a new runbook paradigm, teaching future agents how to handle the edge case.',
    highlights: ['Incident Timelines', 'Knowledge Archival', 'Stakeholder Comms']
  }
};

export default function Agents() {
  const { data: agents, loading } = useApi<AgentInfo[]>(api.getAgents);
  const agentList = agents || [];

  if (loading) return <Loader text="Loading agents..." />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto space-y-12 pb-20 pt-4 px-4">
      {/* ── Page Header & Overview ── */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-2">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest whitespace-nowrap">Autonomous AI Architecture</span>
        </div>
        <h1 className="font-display text-[40px] leading-[1.05] text-[var(--color-ink)] tracking-tight">The Orchestrator Sequence</h1>
        <p className="text-base text-slate-500 font-medium leading-relaxed">
          Five highly-specialized AI agents work in a continuous, deterministic pipeline.
          From the exact moment an anomaly is detected to the automated deployment of a resolution script,
          the Orchestrator sequence acts as a fully autonomous Site Reliability Engineer.
        </p>
      </div>

      {/* ── Connected Sequence Layout ── */}
      <div className="relative mt-16">
        {/* The central animated connecting line */}
        <div className="absolute left-8 lg:left-1/2 top-8 bottom-8 w-1 bg-gradient-to-b from-emerald-400 via-violet-400 to-blue-400 rounded-full opacity-20 transform lg:-translate-x-1/2" />

        <div className="space-y-16 relative">
          {PIPELINE_STEPS.map((stepName, i) => {
            const apiAgent = agentList.find(a => a.name === stepName);
            const details = AGENT_DETAILS[stepName] || AGENT_DETAILS.monitoring;
            const Icon = AGENT_ICONS[stepName] || Eye;
            const glowColor = AGENT_GLOW[stepName] || '#10b981';

            // Alternate left and right alignment for large screens
            const isEven = i % 2 === 0;

            return (
              <motion.div
                key={stepName}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className={`relative flex flex-col lg:flex-row items-start gap-8 lg:gap-16 ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
              >
                {/* Node on the connecting line */}
                <div className="absolute left-8 lg:left-1/2 top-6 transform -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-xl"
                  style={{ border: `3px solid ${glowColor}` }}>
                  <Icon size={22} style={{ color: glowColor }} />
                  {/* Subtle pulsing glow behind the node */}
                  <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: glowColor }} />
                </div>

                {/* Content Card */}
                <div className={`pl-20 lg:pl-0 w-full lg:w-1/2 ${isEven ? 'lg:pr-12' : 'lg:pl-12'}`}>
                  <div className="glass p-8 rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                    style={{ boxShadow: `0 12px 40px ${glowColor}15, inset 0 1px 1px rgba(255,255,255,0.8)` }}>

                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: glowColor }}>
                        {details.role}
                      </p>
                      {apiAgent && <StatusBadge status={apiAgent.status} pulse />}
                    </div>

                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-4">{details.title}</h2>

                    <p className="text-sm text-slate-600 font-medium leading-relaxed mb-6">
                      {details.overview}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200/50">
                      {details.highlights.map(hl => (
                        <span key={hl} className="px-3 py-1.5 bg-white border border-slate-100/50 text-slate-500 shadow-sm rounded-full text-[10px] font-bold uppercase tracking-wide">
                          {hl}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
