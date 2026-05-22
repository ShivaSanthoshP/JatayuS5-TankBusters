import { Trash2 } from 'lucide-react';
import { useChatStream } from '../hooks/useChatStream';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';

// Full-screen, ChatGPT/Claude-style chat. Fills the viewport and scrolls under
// the floating navbar (no card, no borders, no history sidebar). Messages stay
// in a centered readable column (see MessageList); the input is pinned bottom.
export default function Copilot() {
  const { messages, sending, streamError, send, stop, clear, respondToConfirm } = useChatStream();
  return (
    <div className="relative h-full flex flex-col">
      {/* New-chat control, floating just below the overlaying navbar */}
      <button
        onClick={clear}
        title="Clear conversation"
        className="absolute top-[92px] right-4 z-20 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ink-mute bg-surface/70 backdrop-blur ring-1 ring-hairline-strong/50 hover:bg-surface transition-colors"
      >
        <Trash2 size={13} /> New chat
      </button>

      <MessageList messages={messages} onConfirm={respondToConfirm} />
      {streamError && (
        <div className="text-[11px] text-critical px-4 py-2 border-t border-critical/30 bg-critical/5">
          {streamError}
        </div>
      )}
      <MessageInput onSend={send} onStop={stop} disabled={sending} />
    </div>
  );
}
