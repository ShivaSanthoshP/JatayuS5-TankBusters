import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

// Destructive tools get the critical-red treatment; other risky tools
// (recoverable) get amber.
const DESTRUCTIVE = new Set([
  'delete_runbook', 'delete_simulator', 'disconnect_data_source',
  'purge_self_emitted_logs',
]);

export default function ConfirmCard({
  confirmationId, tool, args, summary, decided, onDecide,
}: {
  confirmationId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  decided: boolean;
  onDecide: (cid: string, d: 'run' | 'cancel') => void;
}) {
  const destructive = DESTRUCTIVE.has(tool);
  const [runEnabled, setRunEnabled] = useState(false);
  useEffect(() => {
    // Brief delay discourages muscle-memory clicks on destructive actions.
    const t = setTimeout(() => setRunEnabled(true), 800);
    return () => clearTimeout(t);
  }, []);
  const border = destructive ? 'border-critical/50' : 'border-warning/50';
  const accent = destructive ? 'text-critical' : 'text-warning';
  return (
    <div className={`rounded-xl border ${border} bg-warning/5 p-3 space-y-2 max-w-[92%]`}>
      <div className={`flex items-center gap-2 ${accent} text-xs font-semibold`}>
        <ShieldAlert size={14} />
        Confirm: <span className="font-mono">{tool}</span>
      </div>
      <p className="text-[11px] text-ink-soft">{summary}</p>
      {Object.keys(args).length > 0 && (
        <pre className="text-[10px] bg-ink/5 text-ink-mute p-2 rounded font-mono overflow-x-auto">
{JSON.stringify(args, null, 2)}
        </pre>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onDecide(confirmationId, 'run')}
          disabled={decided || !runEnabled}
          className={`px-3 py-1.5 rounded-md text-[11px] font-medium ${
            destructive ? 'bg-critical text-white' : 'bg-accent text-[var(--color-surface)]'
          } disabled:opacity-40`}
        >
          {decided ? 'Sent' : runEnabled ? 'Run' : 'Run (wait…)'}
        </button>
        <button
          onClick={() => onDecide(confirmationId, 'cancel')}
          disabled={decided}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-ink/8 text-ink-soft disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
