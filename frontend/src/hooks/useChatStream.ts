import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, confirmAction, type ChatEvent, type ChatMessage } from '../services/chat';

const STORAGE_KEY = 'itops_chat_v1';

export interface ToolInvocation {
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'pending' | 'ok' | 'error' | 'timeout' | 'not_found' | 'invalid_args' | 'cancelled';
  result?: unknown;
  error?: string;
}

export interface ConfirmPrompt {
  confirmationId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  decided: boolean;
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools: ToolInvocation[];
  confirms: ConfirmPrompt[];
  /** True while this assistant message is actively receiving streamed tokens. */
  streaming?: boolean;
}

function newId(): string {
  return Math.random().toString(36).slice(2);
}

export function useChatStream() {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate from localStorage once.
  useEffect(() => {
    let restoredSession = '';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.session_id) restoredSession = parsed.session_id;
        if (Array.isArray(parsed?.messages)) {
          // Clear any stale streaming flag so a reload never shows a stuck caret.
          setMessages(parsed.messages.map((m: DisplayMessage) => ({ ...m, streaming: false })));
        }
      }
    } catch { /* ignore corrupt storage */ }
    setSessionId(restoredSession || crypto.randomUUID());
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!sessionId) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ session_id: sessionId, messages }));
  }, [sessionId, messages]);

  const clear = useCallback(() => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
  }, []);

  const send = useCallback(async (text: string) => {
    if (sending || !text.trim() || !sessionId) return;
    setStreamError(null);
    setSending(true);

    const userMsg: DisplayMessage = { id: newId(), role: 'user', content: text, tools: [], confirms: [], streaming: false };
    const assistantMsg: DisplayMessage = { id: newId(), role: 'assistant', content: '', tools: [], confirms: [], streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const priorText = messages
      .filter((m) => m.role === 'user' || m.content)
      .map<ChatMessage>((m) => ({ role: m.role, content: m.content }));
    const payload = {
      session_id: sessionId,
      messages: [...priorText, { role: 'user' as const, content: text }],
    };

    try {
      for await (const evt of streamChat(payload, ctrl.signal)) {
        applyEvent(evt, assistantMsg.id, setMessages);
        if (evt.event === 'error') setStreamError(evt.data.message);
        if (evt.event === 'done') break;
      }
    } catch (exc) {
      // A user-initiated stop aborts the stream — that is not an error.
      if (!ctrl.signal.aborted) {
        setStreamError(exc instanceof Error ? exc.message : 'stream failed');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      // Streaming is over — drop the caret on this message.
      setMessages((prev) => prev.map((m) => (
        m.id === assistantMsg.id ? { ...m, streaming: false } : m
      )));
    }
  }, [messages, sending, sessionId]);

  const respondToConfirm = useCallback(async (cid: string, decision: 'run' | 'cancel') => {
    setMessages((prev) => prev.map((m) => ({
      ...m,
      confirms: m.confirms.map((c) => (c.confirmationId === cid ? { ...c, decided: true } : c)),
    })));
    await confirmAction({ session_id: sessionId, confirmation_id: cid, decision });
  }, [sessionId]);

  // Abort an in-flight response — keeps whatever has streamed so far.
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sessionId, messages, sending, streamError, send, stop, clear, respondToConfirm };
}

function applyEvent(
  evt: ChatEvent,
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>,
): void {
  setMessages((prev) => prev.map((m) => {
    if (m.id !== assistantId) return m;
    if (evt.event === 'token') {
      return { ...m, content: m.content + evt.data.text };
    }
    if (evt.event === 'tool_started') {
      return {
        ...m,
        tools: [...m.tools, {
          toolCallId: evt.data.tool_call_id, tool: evt.data.tool,
          args: evt.data.args, status: 'pending',
        }],
      };
    }
    if (evt.event === 'tool_result') {
      return {
        ...m,
        tools: m.tools.map((t) => (t.toolCallId === evt.data.tool_call_id
          ? {
              ...t,
              status: (evt.data.status as ToolInvocation['status']) ?? 'ok',
              result: evt.data.result,
              error: evt.data.error,
            }
          : t)),
      };
    }
    if (evt.event === 'confirm_required') {
      return {
        ...m,
        confirms: [...m.confirms, {
          confirmationId: evt.data.confirmation_id, tool: evt.data.tool,
          args: evt.data.args, summary: evt.data.summary, decided: false,
        }],
      };
    }
    return m;
  }));
}
