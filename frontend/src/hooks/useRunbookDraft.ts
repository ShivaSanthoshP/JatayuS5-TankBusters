import { useSyncExternalStore } from 'react';
import type { RunbookEntry, RunbookWrite } from '../types';

/**
 * Tiny global store for the runbook form, so it can be opened from anywhere —
 * the Runbooks page (New / Edit) and the Argus chat (a drafted runbook) — and
 * rendered by a single modal mounted in Layout. No provider needed.
 */
interface DraftState {
  open: boolean;
  entry: RunbookEntry | null;    // editing an existing runbook (has an id)
  prefill: RunbookWrite | null;  // create, prefilled from an Argus draft
}

let state: DraftState = { open: false, entry: null, prefill: null };
const listeners = new Set<() => void>();

function set(next: Partial<DraftState>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

export const runbookDraft = {
  openCreate: () => set({ open: true, entry: null, prefill: null }),
  openEntry: (entry: RunbookEntry) => set({ open: true, entry, prefill: null }),
  openPrefill: (prefill: RunbookWrite) => set({ open: true, entry: null, prefill }),
  close: () => set({ open: false, entry: null, prefill: null }),
};

export function useRunbookDraft(): DraftState {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}

/** Pages showing runbook lists can listen for this to refetch after a save. */
export const RUNBOOKS_CHANGED_EVENT = 'itops:runbooks-changed';
