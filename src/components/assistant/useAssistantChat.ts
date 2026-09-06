'use client';

/**
 * useAssistantChat — client engine for the global assistant dock: POSTs to
 * /api/assistant/chat, reads the SSE stream (meta/delta/tool/ui_tool/error/
 * done), and executes CLIENT UI TOOLS as they arrive (plan §-2.4):
 *   navigate(path, params) → router.push (URL-as-state is the payoff)
 *   highlight(ref)         → window CustomEvent any surface can listen for
 * Canvas-control tools (focus_node/set_lens/set_zoom) are acknowledged but
 * inert until Phase 3 wires the Studio URL state.
 */

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useStudioWorkspace } from '@/components/studio/StudioWorkspaceContext';
import type { AssistantPageContext } from '@/lib/assistant/context-store';

import { ASSISTANT_HIGHLIGHT_EVENT } from '@/lib/app-events';
import { SESSION_ARTIFACT_EVENT, SESSION_ARTIFACT_PENDING_EVENT } from '@/lib/app-events';

export { ASSISTANT_HIGHLIGHT_EVENT };

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
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

export interface AssistantChatState {
  sessionId: string;
  messages: AssistantMessage[];
  status: 'idle' | 'streaming';
  activeTool: string | null;
  /** Live AI-summarized session title, pushed over the `title` SSE frame. */
  title?: string;
  /** Newest first; the pane renders these under the transcript. */
  connectionPrompts: AssistantConnectionPrompt[];
  /** Called by the pill once polling shows the app connected. */
  dismissConnectionPrompt: (id: string) => void;
  send: (text: string, context: AssistantPageContext | null) => Promise<void>;
  reset: () => void;
}

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
  activeTool: string | null;
  title?: string;
  connectionPrompts: AssistantConnectionPrompt[];
};

function emptyThread(): AskThreadSnap {
  return {
    sessionId: `asst-${safeRandomUUID()}`,
    messages: [],
    status: 'idle',
    activeTool: null,
    connectionPrompts: [],
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

export function useAssistantChat(opts?: { shared?: 'station' }): AssistantChatState {
  const shared = opts?.shared === 'station';
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
  const { sessionId, messages, status, activeTool, connectionPrompts } = thread;
  const abortRef = useRef<AbortController | null>(null);

  const runUiTool = useCallback(
    (name: string, input: Record<string, unknown>) => {
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
      // The agent asked to SHOW something on the session view panel. Fire the
      // event and move on (the loop already acknowledged); the panel
      // validates the payload against the zod contract before rendering.
      if (name === 'render_artifact') {
        window.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_EVENT, { detail: input.artifact ?? null }));
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
      // Device tool: tote labels print from THIS workstation through the
      // desktop bridge (silent print under Electron, USB/iframe in browser).
      // Fired-and-shown: the panel reports the outcome in the artifact feed.
      if (name === 'print_handling_unit_labels' && Array.isArray(input.handlingUnitIds)) {
        const ids = input.handlingUnitIds
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0)
          .slice(0, 10);
        if (ids.length > 0) {
          void import('@/components/session/print-handling-unit-labels').then((m) =>
            m.printHandlingUnitLabelsFromChat(ids),
          );
        }
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

  const send = useCallback(
    async (text: string, context: AssistantPageContext | null) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'streaming') return;

      const assistantId = `m-${safeRandomUUID()}`;
      setThread({
        ...thread,
        messages: [
          ...thread.messages,
          { id: `m-${safeRandomUUID()}`, role: 'user', content: trimmed },
          { id: assistantId, role: 'assistant', content: '', streaming: true },
        ],
        status: 'streaming',
      });
      const controller = new AbortController();
      abortRef.current = controller;

      const patchAssistant = (patch: (m: AssistantMessage) => AssistantMessage) =>
        setThread({
          ...getLive(),
          messages: getLive().messages.map((m) => (m.id === assistantId ? patch(m) : m)),
        });

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: trimmed,
            context: context
              ? {
                  page: context.page,
                  station: context.station ?? null,
                  mode: context.mode ?? null,
                  selection: context.selection ?? null,
                  skill: context.skill ?? null,
                }
              : null,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.detail || detail?.error || `assistant request failed (${res.status})`);
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
            if (event === 'delta' && typeof payload.text === 'string') {
              patchAssistant((m) => ({ ...m, content: m.content + payload.text }));
            } else if (event === 'tool') {
              setThread({
                ...getLive(),
                activeTool: payload.status === 'start' ? String(payload.name) : null,
              });
            } else if (event === 'ui_tool') {
              runUiTool(String(payload.name), (payload.input ?? {}) as Record<string, unknown>);
            } else if (event === 'ui_tool_start' && payload.name === 'render_artifact') {
              // The model only OPENED the tool block — hold the panel's head
              // slot now so the answer surface is not blank for the rest of
              // the message.
              window.dispatchEvent(
                new CustomEvent(SESSION_ARTIFACT_PENDING_EVENT, { detail: { pending: true } }),
              );
            } else if (event === 'error') {
              patchAssistant((m) => ({
                ...m,
                error: true,
                content: m.content || String(payload.message ?? 'The assistant hit an error.'),
              }));
            } else if (event === 'title' && typeof payload.title === 'string' && payload.title.trim()) {
              // The server summarized the first message into a real name. Keep
              // it on the thread; AgentSessionPanel publishes it to the header /
              // spine current-session row (it owns the session-title store).
              setThread({ ...getLive(), title: payload.title.trim() });
            }
          }
        }
        patchAssistant((m) => ({ ...m, streaming: false }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The assistant is unavailable.';
        patchAssistant((m) => ({ ...m, streaming: false, error: true, content: m.content || message }));
      } finally {
        // Whatever ended the stream — done, abort, error — the placeholder is
        // released. A stuck skeleton is worse than an empty panel.
        window.dispatchEvent(
          new CustomEvent(SESSION_ARTIFACT_PENDING_EVENT, { detail: { pending: false } }),
        );
        setThread({ ...getLive(), activeTool: null, status: 'idle' });
        abortRef.current = null;
      }
    },
    [router, runUiTool, sessionId, status, shared, thread, setThread, getLive],
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

  return {
    sessionId,
    messages,
    status,
    activeTool,
    title: thread.title,
    connectionPrompts,
    dismissConnectionPrompt,
    send,
    reset,
  };
}
