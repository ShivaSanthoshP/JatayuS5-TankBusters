import { useChatStream } from '../hooks/useChatStream';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';
import ClearConversationButton from '../components/chat/ClearConversationButton';

// Full-screen, ChatGPT/Claude-style chat. Fills the viewport and scrolls under
// the floating navbar (no card, no borders, no history sidebar). Messages stay
// in a centered readable column (see MessageList); the input is pinned bottom.
export default function Copilot() {
  const { messages, sending, streamError, send, stop, clear, respondToConfirm } = useChatStream();
  return (
    <div className="relative h-full flex flex-col">
      {/* Clear-conversation control — floats below the navbar, shown only
          when there is actually a conversation to clear */}
      {messages.length > 0 && (
        <div className="absolute top-[92px] right-4 z-20">
          <ClearConversationButton onClear={clear} />
        </div>
      )}

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
