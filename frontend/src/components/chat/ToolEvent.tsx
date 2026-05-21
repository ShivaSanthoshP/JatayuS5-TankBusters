import { useState } from 'react';
import { Wrench, ChevronDown, Loader2, Check, AlertCircle } from 'lucide-react';
import type { ToolInvocation } from '../../hooks/useChatStream';

export default function ToolEvent({ inv }: { inv: ToolInvocation }) {
  const [open, setOpen] = useState(false);
  const Icon = inv.status === 'pending' ? Loader2
    : inv.status === 'ok' ? Check
      : AlertCircle;
  const color = inv.status === 'pending' ? 'text-ink-mute'
    : inv.status === 'ok' ? 'text-success'
      : 'text-critical';
  return (
    <div className="inline-flex flex-col gap-1 max-w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#13171a] text-[#9aa6ab] text-[11px] font-mono ring-1 ring-white/10 hover:bg-[#0e1112]"
      >
        <Wrench size={11} />
        <span>{inv.tool}</span>
        <Icon size={11} className={`${color} ${inv.status === 'pending' ? 'animate-spin' : ''}`} />
        <ChevronDown size={10} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <pre className="text-[10px] bg-[#0e1112] text-[#cfd6da] p-2 rounded-md font-mono max-w-full overflow-x-auto">
{JSON.stringify({ args: inv.args, status: inv.status, result: inv.result, error: inv.error }, null, 2)}
        </pre>
      )}
    </div>
  );
}
