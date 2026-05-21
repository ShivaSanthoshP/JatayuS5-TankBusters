import { X, Trash2, Wand2 } from 'lucide-react';
import { useChatStream } from '../../hooks/useChatStream';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

export default function ChatPanel({ onClose }: { onClose: () => void }) {
  const { messages, sending, streamError, send, clear, respondToConfirm } = useChatStream();
  return (
    <div className="h-full w-full flex flex-col rounded-2xl bg-surface/95 backdrop-blur-lg ring-1 ring-hairline-strong shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline-strong/60">
        <Wand2 size={16} className="text-accent" />
        <span className="text-sm font-semibold text-ink">SRE Copilot</span>
        <span className="text-[10px] text-ink-faint uppercase tracking-wide">beta</span>
        <button onClick={clear} className="ml-auto p-1.5 rounded hover:bg-black/8" title="Clear conversation">
          <Trash2 size={14} className="text-ink-mute" />
        </button>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-black/8" title="Close">
          <X size={14} className="text-ink-mute" />
        </button>
      </div>
      <MessageList messages={messages} onConfirm={respondToConfirm} />
      {streamError && (
        <div className="text-[11px] text-critical px-4 py-2 border-t border-critical/30 bg-critical/5">
          {streamError}
        </div>
      )}
      <MessageInput onSend={send} disabled={sending} />
    </div>
  );
}
