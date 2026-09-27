'use client';

/**
 * useSessionArtifacts — client state for the artifacts of the AI session.
 *
 * Subscribes to the agent's `render_artifact` UI-tool events, validates every
 * payload against the zod contract (ui-artifacts.ts) BEFORE it can render, and
 * keeps them in ARRIVAL order, each anchored to the assistant message that
 * produced it (`messageId`). The transcript draws every entry as a compact
 * card under its message; an invalid payload degrades to a rejected card —
 * never a rendered guess.
 *
 * One PENDING slot rides alongside: the loop announces the opened
 * `render_artifact` block (`ui_tool_start`) long before its payload finishes
 * streaming, so the transcript shows a "Preparing…" card immediately and the
 * arriving artifact REPLACES it. Any stream ending releases the slot.
 *
 * ## What opens the panel
 *
 * The side panel shows ONE entry. A LIVE turn's `render_artifact` opens it on
 * arrival (`detail.live`): each valid artifact of the turn takes the panel, so
 * the newest one wins. Nothing replayed or derived opens it — a reopened past
 * session, a leaked table moved to a card, a printer report, a rejected
 * payload. Clicking a card (`open(id)`) switches to it; × / Esc `close()`.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  SESSION_ARTIFACT_EVENT,
  SESSION_ARTIFACT_PENDING_EVENT,
  SESSION_ARTIFACT_STALE_EVENT,
  type SessionArtifactEventDetail,
  type SessionArtifactPendingDetail,
} from '@/lib/app-events';
import { sessionArtifactSchema, type SessionArtifact } from '@/lib/assistant/ui-artifacts';
import { safeRandomUUID } from '@/lib/safe-uuid';

export interface SessionArtifactEntry {
  id: string;
  artifact: SessionArtifact | null;
  /** The registered tool that produced this artifact — the panel's provenance. */
  producedBy?: string;
  rejected?: string;
  /** Placeholder for an announced-but-unfinished artifact. Never openable. */
  pending?: true;
  /** Set when a later turn failed — this artifact is from an earlier turn. */
  staleAt?: number;
  staleReason?: string;
  /** The assistant message it belongs under; null = the foot of the transcript. */
  messageId: string | null;
  at: number;
}

/** A long session keeps its most recent cards; the oldest fall off first. */
const MAX_ARTIFACTS = 50;

interface Snapshot {
  entries: readonly SessionArtifactEntry[];
  pending: SessionArtifactEntry | null;
  openId: string | null;
}

let snapshot: Snapshot = { entries: [], pending: null, openId: null };
const listeners = new Set<() => void>();

function commit(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function pushEntry(entry: SessionArtifactEntry, takePanel: boolean): void {
  // The arriving artifact IS the pending slot resolving — replace, never
  // show a real card beside its own placeholder.
  const entries = [...snapshot.entries, entry].slice(-MAX_ARTIFACTS);
  const openId = takePanel
    ? entry.id
    : entries.some((e) => e.id === snapshot.openId)
      ? snapshot.openId
      : null;
  commit({ entries, pending: null, openId });
}

function markStale(reason: string): void {
  const { entries, pending } = snapshot;
  // The newest standing artifact is the one the failed turn was attacking.
  const target = pending ?? entries.at(-1);
  if (!target) return;
  const staled = { staleAt: Date.now(), staleReason: reason };
  commit({
    ...snapshot,
    entries: entries.map((e) => (e.id === target.id ? { ...e, ...staled } : e)),
    pending: pending ? { ...pending, ...staled } : null,
  });
}

/** Validate one payload into a card: the artifact, or a rejected card naming why. */
function toEntry(artifact: unknown, producedBy: string | null | undefined, messageId: string | null): SessionArtifactEntry {
  const base = { id: safeRandomUUID(), at: Date.now(), messageId, producedBy: producedBy ?? undefined };
  const parsed = sessionArtifactSchema.safeParse(artifact);
  if (parsed.success) return { ...base, artifact: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ...base, artifact: null, rejected: issues || 'invalid artifact' };
}

let initialized = false;

/** Idempotent global listener init — call from any surface that can dispatch. */
export function ensureSessionArtifactListener(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener(SESSION_ARTIFACT_EVENT, (event) => {
    const detail = (event as CustomEvent<SessionArtifactEventDetail | undefined>).detail;
    if (!detail) return;
    const entry = toEntry(detail.artifact, detail.producedBy, detail.messageId ?? null);
    pushEntry(entry, detail.live === true && entry.artifact !== null);
  });
  window.addEventListener(SESSION_ARTIFACT_STALE_EVENT, (event) => {
    const reason = (event as CustomEvent<{ reason?: unknown }>).detail?.reason;
    markStale(typeof reason === 'string' ? reason : 'read failed');
  });
  window.addEventListener(SESSION_ARTIFACT_PENDING_EVENT, (event) => {
    const detail = (event as CustomEvent<SessionArtifactPendingDetail | undefined>).detail;
    if (detail?.pending === true) {
      commit({
        ...snapshot,
        pending: {
          id: `pending-${safeRandomUUID()}`,
          artifact: null,
          pending: true,
          messageId: detail.messageId ?? null,
          at: Date.now(),
        },
      });
    } else if (snapshot.pending) {
      commit({ ...snapshot, pending: null });
    }
  });
}

function subscribe(listener: () => void): () => void {
  ensureSessionArtifactListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): Snapshot => snapshot;
const EMPTY: Snapshot = { entries: [], pending: null, openId: null };

export function useSessionArtifacts() {
  const { entries, pending, openId } = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const open = useCallback((id: string) => {
    if (!snapshot.entries.some((e) => e.id === id)) return;
    commit({ ...snapshot, openId: id });
  }, []);

  const close = useCallback(() => {
    if (snapshot.openId !== null) commit({ ...snapshot, openId: null });
  }, []);

  /** A new conversation starts with no cards and no panel. */
  const clear = useCallback(() => commit(EMPTY), []);

  /**
   * A reopened thread's persisted cards, each under its answer. Replaces the
   * cards on screen and never opens the panel — replayed work is not live.
   */
  const hydrate = useCallback(
    (items: ReadonlyArray<{ messageId: string; artifact: unknown; producedBy?: string | null }>) =>
      commit({
        entries: items.map((item) => toEntry(item.artifact, item.producedBy, item.messageId)).slice(-MAX_ARTIFACTS),
        pending: null,
        openId: null,
      }),
    [],
  );

  /** Regenerate / edit superseded these answers: their cards (and the panel, if one is open) go. */
  const dropMessages = useCallback((messageIds: readonly string[]) => {
    if (messageIds.length === 0) return;
    const gone = new Set(messageIds);
    const entries = snapshot.entries.filter((e) => e.messageId === null || !gone.has(e.messageId));
    if (entries.length === snapshot.entries.length) return;
    commit({
      entries,
      pending: snapshot.pending,
      openId: entries.some((e) => e.id === snapshot.openId) ? snapshot.openId : null,
    });
  }, []);

  const opened = openId ? (entries.find((e) => e.id === openId) ?? null) : null;

  return { entries, pending, opened, open, close, clear, hydrate, dropMessages };
}
