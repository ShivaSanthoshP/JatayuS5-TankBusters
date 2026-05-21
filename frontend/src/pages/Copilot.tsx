import { Wand2, Trash2 } from 'lucide-react';
import { useChatStream } from '../hooks/useChatStream';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';

// Full-page SRE Copilot. Lays out like the other pages: a page header followed
// by a full-width glass panel that fills the viewport — not a floating popup.
// Message content is centered in a readable column inside the panel.
export default function Copilot() {
  const { messages, sending, streamError, send, clear, respondToConfirm } = useChatStream();
  return (
    <div className="h-[calc(100vh-180px)] min-h-[460px] flex flex-col">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Wand2 size={18} className="text-accent" />
        <h1 className="text-lg font-display text-ink">SRE Copilot</h1>
        <span className="text-[10px] text-ink-faint uppercase tracking-wide mt-0.5">beta</span>
        <button
          onClick={clear}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ink-mute hover:bg-black/8"
          title="Clear conversation"
        >
          <Trash2 size={14} /> Clear
        </button>
      </div>

      <div className="flex-1 min-h-0 glass rounded-2xl flex flex-col overflow-hidden">
        <MessageList messages={messages} onConfirm={respondToConfirm} />
        {streamError && (
          <div className="text-[11px] text-critical px-4 py-2 border-t border-critical/30 bg-critical/5">
            {streamError}
          </div>
        )}
        <MessageInput onSend={send} disabled={sending} />
      </div>
    </div>
  );
}
