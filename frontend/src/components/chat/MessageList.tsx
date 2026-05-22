import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye } from 'lucide-react';
import type { DisplayMessage } from '../../hooks/useChatStream';
import ToolEvent from './ToolEvent';
import ConfirmCard from './ConfirmCard';
import TypingIndicator from './TypingIndicator';

// Markdown renderers styled for the chat bubble using itops theme tokens.
// react-markdown does not render raw HTML by default, so model text is safe.
const mdComponents: Components = {
  table: ({ node, ...props }) => (
    <table className="border-collapse w-full my-2 text-[13px]" {...props} />
  ),
  th: ({ node, ...props }) => (
    <th className="border border-hairline-strong/60 px-2 py-1 bg-ink/10 font-semibold text-left" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border border-hairline-strong/40 px-2 py-1 align-top" {...props} />
  ),
  ul: ({ node, ...props }) => <ul className="list-disc ml-4 my-1 space-y-0.5" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal ml-4 my-1 space-y-0.5" {...props} />,
  li: ({ node, ...props }) => <li className="leading-snug" {...props} />,
  p: ({ node, ...props }) => <p className="my-1 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  a: ({ node, ...props }) => (
    <a className="text-accent underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  code: ({ node, ...props }) => (
    <code className="px-1 py-0.5 rounded bg-ink/10 font-mono text-[12px]" {...props} />
  ),
  pre: ({ node, ...props }) => (
    <pre className="bg-ink/10 p-2 rounded-md overflow-x-auto my-2 text-[12px]" {...props} />
  ),
};

export default function MessageList({
  messages, onConfirm,
}: {
  messages: DisplayMessage[];
  onConfirm: (cid: string, decision: 'run' | 'cancel') => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-[100px] pb-6 space-y-3">
      {messages.length === 0 && (
        <div className="flex flex-col items-center text-center pt-6 pb-4 px-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3.5"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 20px -8px var(--color-accent-glow)',
            }}
          >
            <Eye size={22} className="text-[var(--color-surface)]" />
          </div>
          <h2 className="font-display text-[20px] text-ink">Hi, I’m Argus.</h2>
          <p className="text-[13px] text-ink-mute mt-1">Nothing on your fleet goes unwatched.</p>
          <p className="text-[12px] text-ink-faint leading-relaxed mt-3.5 max-w-md">
            <span className="font-medium text-ink-soft">Why “Argus”?</span> In Greek myth,
            Argus Panoptes was a giant with a hundred eyes — the all-seeing watchman who
            never closed them all at once. Same idea here: I keep watch over every node
            so nothing slips past you.
          </p>
          <p className="text-[12px] text-ink-faint italic mt-4">
            Try “show me critical nodes” or “what was the last incident?”
          </p>
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
          {(m.content || (m.role === 'assistant' && m.tools.length === 0 && m.confirms.length === 0)) && (
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
              m.role === 'user' ? 'bg-accent text-[var(--color-surface)]' : 'bg-ink/5 text-ink'
            }`}>
              {m.role === 'assistant' && m.content ? (
                // Assistant answers render as markdown (tables/lists/bold).
                <div className="text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {m.content}
                  </ReactMarkdown>
                  {m.streaming && (
                    <span
                      aria-hidden
                      className="chat-caret -mt-1 inline-block h-[1em] w-[3px] translate-y-[3px] rounded-full bg-accent"
                    />
                  )}
                </div>
              ) : m.role === 'assistant' ? (
                // Assistant bubble with no content yet — animated thinking dots.
                <TypingIndicator />
              ) : (
                // User messages stay plain text so input is never read as markdown.
                <pre className="whitespace-pre-wrap font-sans text-sm">{m.content}</pre>
              )}
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
    </div>
  );
}
