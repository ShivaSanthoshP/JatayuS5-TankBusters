import { useEffect, useState } from 'react';
import { Zap, AlertTriangle } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import * as api from '../../services/api';

const INTERVAL_PRESETS = [10, 30, 60, 120, 300];

/**
 * Auto-pipeline execution control — the top card of the Pipeline page.
 * Self-contained: fetches and persists the auto-run settings itself, and
 * surfaces an LLM-usage warning so the cost of turning it on is explicit.
 */
export default function AutoPipelinePanel() {
  const [enabled, setEnabled] = useState(false);
  const [intervalSecs, setIntervalSecs] = useState(60);
  const [loaded, setLoaded] = useState(false);

  // Pull the current settings once on mount.
  const resync = () => {
    api.getSettings()
      .then((s) => {
        setEnabled(!!s.auto_run_pipeline);
        setIntervalSecs(s.auto_run_interval_seconds ?? 60);
      })
      .catch(() => { /* keep local defaults */ });
  };

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setEnabled(!!s.auto_run_pipeline);
        setIntervalSecs(s.auto_run_interval_seconds ?? 60);
      })
      .catch(() => { /* keep local defaults */ })
      .finally(() => setLoaded(true));
  }, []);

  // Optimistic update; re-sync from the server if the save fails.
  const persist = (partial: { auto_run_pipeline?: boolean; auto_run_interval_seconds?: number }) => {
    api.updateSettings(partial).catch(resync);
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    persist({ auto_run_pipeline: next });
  };

  const commitInterval = (secs: number) => {
    const v = Math.max(5, Math.round(secs) || 5);
    setIntervalSecs(v);
    persist({ auto_run_interval_seconds: v });
  };

  return (
    <GlassCard hover={false}>
      {/* Header: title + toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: enabled
                ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dim))'
                : 'rgba(20,24,32,0.06)',
            }}
          >
            <Zap size={16} className={enabled ? 'text-[var(--color-surface)]' : 'text-ink-faint'} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-soft">Automatic Execution</h2>
            <p className="text-[11px] text-ink-faint mt-0.5">
              {enabled
                ? `Anomalies auto-run the pipeline; full fleet sweep every ${intervalSecs}s`
                : 'Monitoring only — you trigger pipeline runs yourself'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle automatic pipeline execution"
          onClick={toggle}
          disabled={!loaded}
          className="flex items-center gap-2.5 shrink-0 disabled:opacity-50"
        >
          <span className={`text-sm font-medium ${enabled ? 'text-accent' : 'text-ink-mute'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span className="toggle" data-on={enabled}>
            <span
              aria-hidden="true"
              className="toggle-thumb transition-transform duration-200 ease-in-out"
              style={{ transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </span>
        </button>
      </div>

      {/* LLM-usage warning */}
      <div
        className="flex gap-2.5 rounded-xl px-3.5 py-3 mt-4"
        style={{
          background: enabled ? 'rgba(192,138,62,0.12)' : 'rgba(192,138,62,0.06)',
          border: '1px solid rgba(192,138,62,0.28)',
        }}
      >
        <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
        <p className="text-[12px] leading-relaxed text-ink-soft">
          {enabled ? (
            <>
              Automatic execution is <strong>on</strong> — the five-agent LLM pipeline runs on
              every anomaly and re-sweeps the whole fleet every {intervalSecs}s, with no human in
              the loop. Expect LLM token usage and cost to stay elevated.
            </>
          ) : (
            <>
              Turning this on runs the five-agent LLM pipeline on every anomaly and re-sweeps the
              whole fleet every {intervalSecs}s — with no human in the loop. Expect LLM token usage
              and cost to <strong>rise noticeably</strong>. Leave it off to start runs yourself.
            </>
          )}
        </p>
      </div>

      {/* Sweep interval */}
      <div className="mt-4">
        <label className="text-[11px] uppercase tracking-wide text-ink-faint">Sweep interval</label>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <input
            type="number"
            min={5}
            step={5}
            value={intervalSecs}
            disabled={!enabled}
            onChange={(e) => setIntervalSecs(Math.max(5, parseInt(e.target.value) || 5))}
            onBlur={(e) => commitInterval(parseInt(e.target.value) || 5)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInterval(parseInt((e.target as HTMLInputElement).value) || 5);
            }}
            className={`w-24 glass-sm rounded-lg px-3 py-2 text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-accent/40 ${
              enabled ? 'text-ink' : 'opacity-50 cursor-not-allowed'
            }`}
          />
          <span className="text-sm text-ink-mute">seconds</span>
          <div className="flex gap-1.5 ml-auto flex-wrap">
            {INTERVAL_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => commitInterval(s)}
                disabled={!enabled}
                className={`text-xs px-2 py-1 rounded-full ${
                  intervalSecs === s
                    ? 'bg-accent/12 text-accent font-medium'
                    : 'glass-sm text-ink-mute hover:bg-ink/8'
                } ${enabled ? '' : 'opacity-50 cursor-not-allowed'}`}
              >
                {s < 60 ? `${s}s` : `${s / 60}m`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
