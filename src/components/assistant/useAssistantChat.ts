'use client';

/**
 * useAssistantChat — client engine for the global assistant dock: POSTs to
 * /api/assistant/chat, reads the SSE stream (meta/step/delta/reasoning/tool/
 * step_end/ui_tool/error/done/suggestions/title), and executes CLIENT UI TOOLS as they arrive
 * (plan §-2.4):
 *   navigate(path, params) → router.push (URL-as-state is the payoff)
 *   highlight(ref)         → window CustomEvent any surface can listen for
 * Canvas-control tools (focus_node/set_lens/set_zoom) are acknowledged but
 * inert until Phase 3 wires the Studio URL state.
 *
 * The turn itself — answer text vs. thinking history — is folded by the
 * shared reducer in `@/lib/assistant/turn-trace`, the same one the route uses
 * to persist it.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { handlingUnitHandle } from '@/lib/barcode-routing';
import { useStudioWorkspace } from '@/components/studio/StudioWorkspaceContext';
import type { AssistantPageContext } from '@/lib/assistant/context-store';
import type { AssistantAccessMode } from '@/lib/assistant/access-mode';
import type { ChatHistoryRow } from '@/lib/assistant/chat-persistence';
import {
  applyTurnFrame,
  beginTurn,
  parseTurnFrame,
  parseTurnTrace,
  settleTurn,
  type AssistantStep,
  type AssistantTurnDraft,
  type TurnUsage,
} from '@/lib/assistant/turn-trace';

import { ASSISTANT_HIGHLIGHT_EVENT } from '@/lib/app-events';
import {
  SESSION_ARTIFACT_EVENT,
  SESSION_ARTIFACT_PENDING_EVENT,
  SESSION_ARTIFACT_STALE_EVENT,
  type SessionArtifactEventDetail,
  type SessionArtifactPendingDetail,
} from '@/lib/app-events';

export { ASSISTANT_HIGHLIGHT_EVENT };

export type { AssistantStep };

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The ANSWER only; a tool round's narration is a `note` step instead. */
  content: string;
  streaming?: boolean;
  error?: boolean;
  /**
   * Tools this answer actually ran (angle 15), first-use order. The same
   * provenance, step by step, is the `tool` steps in `steps`.
   */
  toolsUsed?: string[];
  /** The turn's work in order — reasoning, notes, tool calls. [] for a user turn. */
  steps: AssistantStep[];
  /** Turn start → the answer's first text; null while unknown / for a user turn. */
  thinkingMs: number | null;
  /** The operator stopped the turn; `content` is what arrived before. */
  stopped?: boolean;
  /** Next questions the server offered under this answer (`suggestions` frame). */
  suggestions?: string[];
  /** What the turn cost (`done.usage`, or the persisted row's). */
  usage?: TurnUsage | null;
  /** The operator's rating of this answer. */
  feedback?: -1 | 1 | null;
  /** Why the turn failed (`error.code`, or `rate_limited` for an HTTP 429). */
  errorCode?: string;
  /** Epoch ms before which Retry waits (rate limited). */
  retryAfter?: number;
}

/** A persisted card to re-create under its answer (`useSessionArtifacts.hydrate`). */
export interface HydratedArtifact {
  messageId: string;
  artifact: unknown;
  producedBy?: string | null;
}

/**
 * A `GET /api/ai/chat-sessions/[id]` row's id is the turn's client id; legacy
 * rows surface as `db-<serial>` and cannot be rewound (regenerate / edit) or rated.
 */
export function isAddressableMessageId(id: string): boolean {
  return !id.startsWith('db-');
}

/**
 * An inline "Connect <app>" prompt raised by the `request_connection` UI tool.
 *
 * It lives on the THREAD, not in a message, because the operator may authorize
 * minutes later — after more turns — and the pill has to survive that without
 * rewriting transcript history. `connectUrl` is always a server-minted link.
 */
export interface AssistantConnectionPrompt {
  id: string;
  app: string;
  appLabel: string;
  connectUrl: string;
  reason: string | null;
}

/**
 * Where one chat-raised label print is on the staff print bridge:
 * finding a station → (pick) → sending → acked (printing n/total) → printed,
 * or failed. The operator can retry a failed print.
 */
export type AssistantPrintPhase =
  | { kind: 'finding' }
  | { kind: 'pick'; reason: string }
  | { kind: 'sending'; station: string }
  | { kind: 'acked'; station: string; done: number; total: number }
  | { kind: 'printed'; station: string; labels: number }
  | { kind: 'failed'; reason: string };

/**
 * A `print_handling_unit_labels` call, sent to the staffer's print station.
 * Lives on the THREAD (like connection prompts) so every surface showing the
 * thread reads one state, and the phase move to `sending` is the one claim
 * that sends the job exactly once.
 */
export interface AssistantPrintJob {
  id: string;
  /** The answer that raised it — the card renders under it. */
  messageId: string;
  /** House handles (`H-{id}`) the station reprints. */
  codes: string[];
  phase: AssistantPrintPhase;
}

export interface AssistantChatState {
  sessionId: string;
  messages: AssistantMessage[];
  status: 'idle' | 'streaming';
  /** Live AI-summarized session title, pushed over the `title` SSE frame. */
  title?: string;
  /** Newest first; the pane renders these under the transcript. */
  connectionPrompts: AssistantConnectionPrompt[];
  /** Called by the pill once polling shows the app connected. */
  dismissConnectionPrompt: (id: string) => void;
  /** Label prints this session raised, oldest first. Not persisted: a reload never re-prints. */
  printJobs: AssistantPrintJob[];
  /**
   * Move a print to `next`; with `from`, only when it is currently in one of
   * those phases. Returns whether it moved.
   */
  setPrintPhase: (id: string, next: AssistantPrintPhase, from?: readonly AssistantPrintPhase['kind'][]) => boolean;
  send: (text: string, context: AssistantPageContext | null) => Promise<void>;
  /** Abort the running turn; the partial answer stays, marked stopped. */
  stop: () => void;
  /**
   * Re-run the LAST answer from the question before it (also Retry after a
   * failure). The old answer is superseded server-side and dropped here.
   */
  regenerate: (context: AssistantPageContext | null) => Promise<void>;
  /** Replace a user message (and everything after it) with `text`, then answer it. */
  editAndResend: (messageId: string, text: string, context: AssistantPageContext | null) => Promise<void>;
  /** Re-enter a persisted thread; the next send continues it. Returns its cards. */
  load: (sessionId: string, rows: readonly ChatHistoryRow[], title: string | null) => HydratedArtifact[];
  /** Rate an answer (0 clears). Optimistic; reverts and resolves false on failure. */
  rate: (messageId: string, rating: -1 | 0 | 1, note?: string) => Promise<boolean>;
  reset: () => void;
}

/** A rate-limited (429) turn offers Retry after this cooldown. */
const RETRY_COOLDOWN_MS = 5_000;

function parseSseChunk(buffer: string): { events: Array<{ event: string; data: string }>; rest: string } {
  const events: Array<{ event: string; data: string }> = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    let event = 'message';
    let data = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return { events, rest };
}

type AskThreadSnap = {
  sessionId: string;
  messages: AssistantMessage[];
  status: 'idle' | 'streaming';
  title?: string;
  connectionPrompts: AssistantConnectionPrompt[];
  printJobs: AssistantPrintJob[];
};

function emptyThread(): AskThreadSnap {
  return {
    sessionId: `asst-${safeRandomUUID()}`,
    messages: [],
    status: 'idle',
    connectionPrompts: [],
    printJobs: [],
  };
}

let stationSnap: AskThreadSnap = emptyThread();
const stationListeners = new Set<() => void>();

function subscribeStationAsk(listener: () => void): () => void {
  stationListeners.add(listener);
  return () => stationListeners.delete(listener);
}

function getStationAskSnap(): AskThreadSnap {
  return stationSnap;
}

function setStationAskSnap(next: AskThreadSnap): void {
  stationSnap = next;
  for (const listener of stationListeners) listener();
}

/** Drop the Unbox Ask thread when the open carton changes. */
export function resetStationAskThread(): void {
  setStationAskSnap(emptyThread());
}

export function useAssistantChat(opts?: {
  shared?: 'station';
  /** Regenerate / edit is about to supersede these messages (drop their cards). */
  onSupersede?: (messageIds: string[]) => void;
  /** The composer's access mode; the server enforces it (`ask` = read-only). Absent = full. */
  accessMode?: AssistantAccessMode;
}): AssistantChatState {
  const shared = opts?.shared === 'station';
  const accessModeRef = useRef<AssistantAccessMode>(opts?.accessMode ?? 'full');
  accessModeRef.current = opts?.accessMode ?? 'full';
  const router = useRouter();
  // The dock is inside StudioWorkspaceProvider, so it can drive the Studio's
  // URL view state directly (canvas-control tools). setParams hard-routes to
  // /studio, so it doubles as navigate-into-Studio from any page.
  const studio = useStudioWorkspace();
  const [local, setLocal] = useState<AskThreadSnap>(emptyThread);
  const station = useSyncExternalStore(subscribeStationAsk, getStationAskSnap, getStationAskSnap);
  const thread = shared ? station : local;
  const localRef = useRef(local);
  localRef.current = local;
  const setThread = useCallback(
    (next: AskThreadSnap) => {
      if (shared) {
        setStationAskSnap(next);
        return;
      }
      localRef.current = next;
      setLocal(next);
    },
    [shared],
  );
  const getLive = useCallback(
    () => (shared ? getStationAskSnap() : localRef.current),
    [shared],
  );
  const { sessionId, messages, status, connectionPrompts } = thread;
  const abortRef = useRef<AbortController | null>(null);

  const runUiTool = useCallback(
    (name: string, input: Record<string, unknown>, messageId: string) => {
      // '/'-anchored app paths only; '//host' is protocol-relative (external).
      if (name === 'navigate' && typeof input.path === 'string' && input.path.startsWith('/') && !input.path.startsWith('//')) {
        const params = input.params && typeof input.params === 'object' ? (input.params as Record<string, string>) : null;
        const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
        router.push(`${input.path}${qs}`);
        return;
      }
      if (name === 'highlight' && typeof input.ref === 'string') {
        window.dispatchEvent(new CustomEvent(ASSISTANT_HIGHLIGHT_EVENT, { detail: { ref: input.ref } }));
        return;
      }
      // The agent asked to SHOW something. Fire the event, anchored to the
      // answer it belongs under, and move on (the loop already acknowledged);
      // the session store validates the payload against the zod contract.
      if (name === 'render_artifact') {
        // A report tool's artifact carries its producer on the ui_tool input;
        // a model-typed payload has none and stays unattributed.
        const detail: SessionArtifactEventDetail = {
          artifact: input.artifact ?? null,
          producedBy: typeof input.producedBy === 'string' ? input.producedBy : null,
          messageId,
          live: true,
        };
        window.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_EVENT, { detail }));
        return;
      }
      // An in-chat OAuth handoff. The URL is whatever the server-side tool
      // minted; this only validates that it IS an https URL before it becomes
      // a clickable button, so a mangled model echo cannot render as a link.
      if (name === 'request_connection') {
        const connectUrl = typeof input.connectUrl === 'string' ? input.connectUrl : '';
        const app = typeof input.app === 'string' ? input.app : '';
        if (!connectUrl.startsWith('https://') || app.length === 0) return;
        const prompt: AssistantConnectionPrompt = {
          id: `${app}:${connectUrl}`,
          app,
          appLabel: typeof input.appLabel === 'string' && input.appLabel ? input.appLabel : app,
          connectUrl,
          reason: typeof input.reason === 'string' && input.reason ? input.reason : null,
        };
        const live = getLive();
        if (live.connectionPrompts.some((p) => p.id === prompt.id)) return;
        setThread({ ...live, connectionPrompts: [prompt, ...live.connectionPrompts].slice(0, 3) });
        return;
      }
      // Device tool: the labels print on the staffer's print station over the
      // staff print bridge. The job rides the thread; the transcript's print
      // card resolves the station, sends it once, and shows each phase.
      if (name === 'print_handling_unit_labels' && Array.isArray(input.handlingUnitIds)) {
        const ids = input.handlingUnitIds
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0)
          .slice(0, 10);
        if (ids.length === 0) return;
        const live = getLive();
        const job: AssistantPrintJob = {
          id: `print-${safeRandomUUID()}`,
          messageId,
          codes: [...new Set(ids)].map(handlingUnitHandle),
          phase: { kind: 'finding' },
        };
        setThread({ ...live, printJobs: [...live.printJobs, job] });
        return;
      }
      // Canvas-control tools drive the Studio URL view state (?focus/z/lens);
      // setParams hard-routes to /studio, so these also navigate there.
      if (name === 'focus_node' && typeof input.nodeId === 'string' && /^[a-z0-9:_-]+$/i.test(input.nodeId)) {
        studio.setParams({ focus: input.nodeId, z: '1' });
        return;
      }
      if (name === 'set_lens' && typeof input.lens === 'string') {
        const lens = input.lens;
        if (['build', 'live', 'flow', 'people', 'gaps', 'static'].includes(lens)) studio.setParams({ lens });
        return;
      }
      if (name === 'set_zoom' && (input.z === 0 || input.z === 1 || input.z === 2)) {
        studio.setParams({ z: String(input.z) });
        return;
      }
    },
    [router, studio, getLive, setThread],
  );

  const onSupersedeRef = useRef(opts?.onSupersede);
  onSupersedeRef.current = opts?.onSupersede;

  /**
   * One turn on the wire. `base` is the transcript the turn continues (a
   * rewind has already cut it). A NEW question (send, edit) appends the user
   * row; a regenerate re-answers the anchor already in `base`.
   */
  const runTurn = useCallback(
    async (args: {
      base: AssistantMessage[];
      question: string;
      userId: string;
      appendUser: boolean;
      rewind?: { messageId: string; mode: 'edit' | 'regenerate' };
      context: AssistantPageContext | null;
    }) => {
      const { context } = args;
      const assistantId = `m-${safeRandomUUID()}`;
      const live = getLive();
      const userRow: AssistantMessage[] = args.appendUser
        ? [{ id: args.userId, role: 'user', content: args.question, steps: [], thinkingMs: null }]
        : [];
      setThread({
        ...live,
        messages: [
          ...args.base,
          ...userRow,
          { id: assistantId, role: 'assistant', content: '', streaming: true, steps: [], thinkingMs: null },
        ],
        status: 'streaming',
      });
      const controller = new AbortController();
      abortRef.current = controller;

      const patchMessage = (id: string, patch: (m: AssistantMessage) => AssistantMessage) =>
        setThread({
          ...getLive(),
          messages: getLive().messages.map((m) => (m.id === id ? patch(m) : m)),
        });
      // The reducer's draft is the ONLY writer of the answer and its steps;
      // the message is a projection of it.
      let turn: AssistantTurnDraft = beginTurn(Date.now());
      const showTurn = (extra: Partial<AssistantMessage> = {}) =>
        patchMessage(assistantId, (m) => ({
          ...m,
          content: turn.content,
          steps: turn.steps,
          thinkingMs: turn.thinkingMs,
          toolsUsed: turn.toolsUsed,
          ...extra,
        }));

      // `done` ends the turn for the operator: the composer unlocks at once
      // while the stream stays open for trailing frames (suggestions, title).
      // Whatever ends it first — done, stop, error, close — releases once.
      let ended = false;
      const endTurn = () => {
        if (ended) return;
        ended = true;
        // A stuck "Preparing…" card is worse than no card.
        const released: SessionArtifactPendingDetail = { pending: false };
        window.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_PENDING_EVENT, { detail: released }));
        if (abortRef.current === controller) abortRef.current = null;
        // A reset / load since this turn began owns the thread now.
        if (getLive().messages.some((m) => m.id === assistantId)) setThread({ ...getLive(), status: 'idle' });
      };

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: live.sessionId,
            message: args.question,
            context: context
              ? {
                  page: context.page,
                  station: context.station ?? null,
                  mode: context.mode ?? null,
                  selection: context.selection ?? null,
                  skill: context.skill ?? null,
                  mentions: context.mentions && context.mentions.length > 0 ? context.mentions : null,
                  attachments: context.attachments && context.attachments.length > 0 ? context.attachments : null,
                }
              : null,
            turnIds: { user: args.userId, assistant: assistantId },
            ...(args.rewind ? { rewind: args.rewind } : {}),
            accessMode: accessModeRef.current,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const detail = (await res.json().catch(() => null)) as { detail?: string; error?: string; code?: string } | null;
          const limited = res.status === 429;
          turn = settleTurn(
            {
              ...turn,
              content: limited
                ? 'The assistant is busy right now — retry in a few seconds.'
                : detail?.detail || detail?.error || `The assistant request failed (${res.status}).`,
            },
            Date.now(),
          );
          showTurn({
            streaming: false,
            error: true,
            errorCode: limited ? 'rate_limited' : (detail?.code ?? 'internal'),
            ...(limited ? { retryAfter: Date.now() + RETRY_COOLDOWN_MS } : {}),
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(buffer);
          buffer = rest;
          for (const { event, data } of events) {
            const payload = JSON.parse(data) as Record<string, unknown>;
            const folded = ended ? null : parseTurnFrame(event, payload);
            if (folded) {
              turn = applyTurnFrame(turn, folded, Date.now());
              showTurn();
            }
            if (event === 'tool') {
              // A tool that FAILED is the tell (angle 13b): the read behind the
              // next answer did not happen, so whatever the panel is holding
              // is from an earlier turn and must say so.
              if (payload.status === 'end' && payload.ok === false) {
                window.dispatchEvent(
                  new CustomEvent(SESSION_ARTIFACT_STALE_EVENT, {
                    detail: { reason: `${String(payload.name)} failed` },
                  }),
                );
              }
            } else if (event === 'ui_tool') {
              runUiTool(String(payload.name), (payload.input ?? {}) as Record<string, unknown>, assistantId);
            } else if (event === 'ui_tool_start' && payload.name === 'render_artifact') {
              // The model only OPENED the tool block — show a "Preparing…"
              // card under this answer now instead of nothing for the rest
              // of the message.
              const detail: SessionArtifactPendingDetail = { pending: true, messageId: assistantId };
              window.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_PENDING_EVENT, { detail }));
            } else if (event === 'error') {
              turn = { ...turn, content: turn.content || String(payload.message ?? 'The assistant hit an error.') };
              showTurn({ error: true, errorCode: typeof payload.code === 'string' ? payload.code : 'internal' });
              // The failed turn may have been trying to REPLACE the artifact
              // on the panel — badge what is standing as stale instead of
              // leaving yesterday's number looking fresh.
              window.dispatchEvent(
                new CustomEvent(SESSION_ARTIFACT_STALE_EVENT, {
                  detail: { reason: String(payload.message ?? 'read failed') },
                }),
              );
            } else if (event === 'done' && !ended) {
              const usage = payload.usage as TurnUsage | null | undefined;
              turn = settleTurn(turn, Date.now());
              showTurn({ streaming: false, usage: usage && typeof usage.totalMs === 'number' ? usage : null });
              endTurn();
            } else if (event === 'suggestions' && Array.isArray(payload.items)) {
              const items = payload.items
                .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                .slice(0, 3);
              const target = typeof payload.messageId === 'string' ? payload.messageId : assistantId;
              if (items.length > 0) patchMessage(target, (m) => ({ ...m, suggestions: items }));
            } else if (event === 'title' && typeof payload.title === 'string' && payload.title.trim()) {
              // The server summarized the first message into a real name. Keep
              // it on the thread; AgentSessionPanel publishes it to the
              // session-title store the sidebar's current row reads.
              setThread({ ...getLive(), title: payload.title.trim() });
            }
          }
        }
        if (!ended) {
          turn = settleTurn(turn, Date.now());
          showTurn({ streaming: false });
        }
      } catch (err) {
        // After `done` only trailing frames were lost — the answer stands.
        if (ended) return;
        if (controller.signal.aborted) {
          // Stopped by the operator (or a reset): keep what arrived, no error.
          turn = settleTurn(turn, Date.now());
          showTurn({ streaming: false, stopped: true });
          return;
        }
        const message = err instanceof Error ? err.message : 'The assistant is unavailable.';
        turn = settleTurn({ ...turn, content: turn.content || message }, Date.now());
        showTurn({ streaming: false, error: true, errorCode: 'network' });
      } finally {
        endTurn();
      }
    },
    [runUiTool, setThread, getLive],
  );

  const send = useCallback(
    async (text: string, context: AssistantPageContext | null) => {
      const trimmed = text.trim();
      const live = getLive();
      if (!trimmed || live.status === 'streaming') return;
      await runTurn({ base: live.messages, question: trimmed, userId: `m-${safeRandomUUID()}`, appendUser: true, context });
    },
    [getLive, runTurn],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(
    async (context: AssistantPageContext | null) => {
      const live = getLive();
      if (live.status === 'streaming') return;
      const anchorIdx = live.messages.findLastIndex((m) => m.role === 'user');
      const anchor = live.messages[anchorIdx];
      if (!anchor || !isAddressableMessageId(anchor.id)) return;
      onSupersedeRef.current?.(live.messages.slice(anchorIdx + 1).map((m) => m.id));
      await runTurn({
        base: live.messages.slice(0, anchorIdx + 1),
        question: anchor.content,
        userId: anchor.id,
        appendUser: false,
        rewind: { messageId: anchor.id, mode: 'regenerate' },
        context,
      });
    },
    [getLive, runTurn],
  );

  const editAndResend = useCallback(
    async (messageId: string, text: string, context: AssistantPageContext | null) => {
      const trimmed = text.trim();
      const live = getLive();
      if (!trimmed || live.status === 'streaming' || !isAddressableMessageId(messageId)) return;
      const idx = live.messages.findIndex((m) => m.id === messageId && m.role === 'user');
      if (idx < 0) return;
      onSupersedeRef.current?.(live.messages.slice(idx).map((m) => m.id));
      await runTurn({
        base: live.messages.slice(0, idx),
        question: trimmed,
        userId: `m-${safeRandomUUID()}`,
        appendUser: true,
        rewind: { messageId, mode: 'edit' },
        context,
      });
    },
    [getLive, runTurn],
  );

  const load = useCallback(
    (loadedSessionId: string, rows: readonly ChatHistoryRow[], loadedTitle: string | null): HydratedArtifact[] => {
      abortRef.current?.abort();
      const cards: HydratedArtifact[] = [];
      const loaded = rows.map((row): AssistantMessage => {
        if (row.role === 'user') return { id: row.id, role: 'user', content: row.content, steps: [], thinkingMs: null };
        const trace = parseTurnTrace(row.analysis);
        for (const a of trace?.artifacts ?? []) cards.push({ messageId: row.id, artifact: a.artifact, producedBy: a.producedBy });
        return {
          id: row.id,
          role: 'assistant',
          content: row.content,
          steps: trace?.steps ?? [],
          thinkingMs: trace?.thinkingMs ?? null,
          ...(row.error ? { error: true, errorCode: 'internal' } : {}),
          ...(trace?.stopped ? { stopped: true } : {}),
          ...(trace?.suggestions ? { suggestions: trace.suggestions } : {}),
          usage: trace?.usage ?? null,
          feedback: row.feedback,
        };
      });
      setThread({
        sessionId: loadedSessionId,
        messages: loaded,
        status: 'idle',
        ...(loadedTitle ? { title: loadedTitle } : {}),
        connectionPrompts: [],
        printJobs: [],
      });
      return cards;
    },
    [setThread],
  );

  const rate = useCallback(
    async (messageId: string, rating: -1 | 0 | 1, note?: string): Promise<boolean> => {
      const live = getLive();
      const before = live.messages.find((m) => m.id === messageId)?.feedback ?? null;
      const setFeedback = (feedback: -1 | 1 | null) =>
        setThread({
          ...getLive(),
          messages: getLive().messages.map((m) => (m.id === messageId ? { ...m, feedback } : m)),
        });
      setFeedback(rating === 0 ? null : rating);
      try {
        const res = await fetch(`/api/ai/chat-sessions/${encodeURIComponent(live.sessionId)}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, rating, ...(note ? { note } : {}) }),
        });
        if (res.ok) return true;
      } catch {
        /* reverted below */
      }
      setFeedback(before);
      return false;
    },
    [getLive, setThread],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setThread(emptyThread());
  }, [setThread]);

  const dismissConnectionPrompt = useCallback(
    (id: string) => {
      const live = getLive();
      setThread({ ...live, connectionPrompts: live.connectionPrompts.filter((p) => p.id !== id) });
    },
    [getLive, setThread],
  );

  const setPrintPhase = useCallback(
    (id: string, next: AssistantPrintPhase, from?: readonly AssistantPrintPhase['kind'][]): boolean => {
      const live = getLive();
      const job = live.printJobs.find((j) => j.id === id);
      if (!job || (from && !from.includes(job.phase.kind))) return false;
      setThread({ ...live, printJobs: live.printJobs.map((j) => (j.id === id ? { ...j, phase: next } : j)) });
      return true;
    },
    [getLive, setThread],
  );

  return {
    sessionId,
    messages,
    status,
    title: thread.title,
    connectionPrompts,
    dismissConnectionPrompt,
    printJobs: thread.printJobs,
    setPrintPhase,
    send,
    stop,
    regenerate,
    editAndResend,
    load,
    rate,
    reset,
  };
}
