'use client';

/**
 * useSessionArtifacts — client state for the session view panel.
 *
 * Subscribes to the agent's `render_artifact` UI-tool events, validates every
 * payload against the zod contract (ui-artifacts.ts) BEFORE rendering, and
 * keeps a newest-first stack so a conversation can lay down several artifacts
 * the way it lays down several paragraphs. An invalid artifact degrades to a
 * rejected notice in the stack — never a rendered guess.
 *
 * One PENDING slot sits ahead of that stack: the loop announces the opened
 * `render_artifact` block (`ui_tool_start`) long before its payload finishes
 * streaming, so the panel paints a placeholder immediately and the arriving
 * artifact REPLACES it. The slot is not history — it never occupies a
 * MAX_ARTIFACTS row, is never selectable, and any stream ending releases it.
 *
 * ## Arrival takes the pane
 *
 * Both arrival doors promote the right pane to the artifact plane
 * (`setSessionPanelOccupant('artifact')`), which is what `SessionSurface`'s
 * "the board is the RESTING occupant; `render_artifact` pushes it aside"
 * contract has always claimed. Until this store said so, nothing did: the
 * occupant rested on `board` and only ⌘B moved it, so a report the model
 * rendered was valid, stacked, and invisible — the operator was looking at the
 * floor feed. A REJECTED payload promotes too: the refusal notice is the answer
 * to "where is my report", and hiding it behind a chord is how an owner
 * concludes the assistant ignored him. Releasing a pending slot does NOT demote
 * — the operator's pane is his, and a stream that ended without an artifact
 * must not yank the surface out from under him.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { SESSION_ARTIFACT_EVENT, SESSION_ARTIFACT_PENDING_EVENT } from '@/lib/app-events';
import { sessionArtifactSchema, type SessionArtifact } from '@/lib/assistant/ui-artifacts';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { setSessionPanelOccupant } from './session-panel-occupant';

export interface SessionArtifactEntry {
  id: string;
  artifact: SessionArtifact | null;
  rejected?: string;
  /** Placeholder for an announced-but-unfinished artifact. Never history. */
  pending?: true;
  at: number;
}

const MAX_ARTIFACTS = 20;

let seq = 0;
let entries: SessionArtifactEntry[] = [];
let pending: SessionArtifactEntry | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  seq += 1;
  for (const listener of listeners) listener();
}

function pushEntry(entry: SessionArtifactEntry): void {
  // The arriving artifact IS the pending slot resolving — replace, never
  // stack a real artifact beside its own placeholder.
  pending = null;
  entries = [entry, ...entries].slice(0, MAX_ARTIFACTS);
  // The answer takes the column it was rendered for.
  setSessionPanelOccupant('artifact');
  emit();
}

function setPending(next: boolean): void {
  if (next) {
    pending = { id: `pending-${safeRandomUUID()}`, artifact: null, pending: true, at: Date.now() };
    // Claim the pane while the payload is still streaming, so the skeleton is
    // where the finished report will be — not one chord away from it.
    setSessionPanelOccupant('artifact');
  } else if (!pending) {
    return;
  } else {
    pending = null;
  }
  emit();
}

let initialized = false;

/** Idempotent global listener init — call from any surface that can dispatch. */
export function ensureSessionArtifactListener(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener(SESSION_ARTIFACT_EVENT, (event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const parsed = sessionArtifactSchema.safeParse(detail);
    if (parsed.success) {
      pushEntry({ id: safeRandomUUID(), artifact: parsed.data, at: Date.now() });
    } else {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      pushEntry({
        id: safeRandomUUID(),
        artifact: null,
        rejected: issues || 'invalid artifact',
        at: Date.now(),
      });
    }
  });
  window.addEventListener(SESSION_ARTIFACT_PENDING_EVENT, (event) => {
    const detail = (event as CustomEvent<{ pending?: unknown }>).detail;
    setPending(detail?.pending === true);
  });
}

export function useSessionArtifacts() {
  useSyncExternalStore(
    (listener) => {
      ensureSessionArtifactListener();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => seq,
    () => 0,
  );

  const select = useCallback((id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    entries = [entry, ...entries.filter((e) => e.id !== id)];
    emit();
  }, []);

  const dismiss = useCallback((id: string) => {
    if (pending?.id === id) pending = null;
    entries = entries.filter((e) => e.id !== id);
    emit();
  }, []);

  const clear = useCallback(() => {
    entries = [];
    pending = null;
    emit();
  }, []);

  // The pending placeholder outranks the stack it will be replaced by; it is
  // deliberately absent from `history` (not selectable, not dismissable).
  const current = pending ?? entries[0] ?? null;
  const history = useMemo(() => (pending ? entries : entries.slice(1)), [entries, pending]);

  return { current, history, select, dismiss, clear };
}
