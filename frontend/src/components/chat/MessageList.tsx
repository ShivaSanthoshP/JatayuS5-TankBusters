import { useEffect, useRef } from 'react';
import type { DisplayMessage } from '../../hooks/useChatStream';
import ToolEvent from './ToolEvent';
import ConfirmCard from './ConfirmCard';

export default function MessageList({
  messages, onConfirm,
}: {
  messages: DisplayMessage[];
  onConfirm: (cid: string, decision: 'run' | 'cancel') => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.length === 0 && (
        <div className="text-xs text-ink-faint italic text-center pt-8">
          Ask me anything — try "show me critical nodes" or "what was the last incident?"
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
          {(m.content || (m.role === 'assistant' && m.tools.length === 0 && m.confirms.length === 0)) && (
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
              m.role === 'user' ? 'bg-accent text-[var(--color-surface)]' : 'bg-ink/5 text-ink'
            }`}>
              <pre className="whitespace-pre-wrap font-sans text-sm">
                {m.content || (m.role === 'assistant' ? '…' : '')}
              </pre>
            </div>
          )}
          {m.role === 'assistant' && m.tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {m.tools.map((t) => <ToolEvent key={t.toolCallId} inv={t} />)}
            </div>
          )}
          {m.role === 'assistant' && m.confirms.map((c) => (
            <ConfirmCard
              key={c.confirmationId}
              confirmationId={c.confirmationId}
              tool={c.tool}
              args={c.args}
              summary={c.summary}
              decided={c.decided}
              onDecide={onConfirm}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
