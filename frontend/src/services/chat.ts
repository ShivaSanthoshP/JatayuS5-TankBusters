// Typed wrapper around POST /api/chat and POST /api/chat/confirm.
// Streams SSE events as parsed objects via an async generator.

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage { role: ChatRole; content: string }

export type ChatEvent =
  | { event: 'token'; data: { text: string } }
  | { event: 'tool_started'; data: { tool_call_id: string; tool: string; args: Record<string, unknown> } }
  | { event: 'tool_result'; data: { tool_call_id: string; status: string; result?: unknown; error?: string; latency_ms?: number } }
  | { event: 'confirm_required'; data: { confirmation_id: string; tool: string; args: Record<string, unknown>; summary: string } }
  | { event: 'done'; data: { terminated_reason: string } }
  | { event: 'error'; data: { message: string } };

const API_BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '/api';

export async function* streamChat(
  payload: { session_id: string; messages: ChatMessage[] },
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const resp = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`Chat request failed: ${resp.status} ${resp.statusText}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let nlIdx: number;
    // SSE frames are separated by blank lines.
    while ((nlIdx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, nlIdx);
      buf = buf.slice(nlIdx + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = line.slice('data:'.length).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as ChatEvent;
      } catch {
        // Malformed frame — skip rather than crash the stream.
      }
    }
  }
}

export async function confirmAction(
  payload: { session_id: string; confirmation_id: string; decision: 'run' | 'cancel' },
): Promise<void> {
  const resp = await fetch(`${API_BASE}/chat/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (resp.status === 204) return;
  if (!resp.ok) throw new Error(`Confirm failed: ${resp.status}`);
}
