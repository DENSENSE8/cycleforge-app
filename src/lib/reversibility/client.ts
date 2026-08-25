/**
 * The Process tool's wire contract, and the default browser implementation.
 *
 * ── WHY THE SOURCE IS AN INTERFACE ──────────────────────────────────────────
 *
 * `ProcessLedgerSource` exists so the panel can be mounted against a fake in a
 * DOM test without a server, and — more immediately — so the component is
 * finished and typed while the three routes it calls are still being stitched
 * in. The component depends on this interface, not on `fetch`; the default
 * implementation below is one of its implementations, not its definition.
 *
 * ── THE ROUTES ──────────────────────────────────────────────────────────────
 *
 * They live under `src/app/api/workspace/process/**`, which is another lane's
 * directory. Their bodies are thin — `withAuth` → `ctx.organizationId` →
 * `readSessionLedger` / `revertAgentMutation` / `discardLedgerEntry` → the JSON
 * below. The shapes are pinned here so both halves compile against the same
 * types the moment they meet.
 *
 * `credentials` is left at the browser default: these are same-origin calls and
 * the session cookie rides along, exactly as every other client fetch in this
 * app does it.
 */

import type { ProcessLedgerEntry } from './types';

/** `GET /api/workspace/process?sessionId=…` */
export interface ProcessLedgerResponse {
  ok: boolean;
  entries: ProcessLedgerEntry[];
  error?: string;
}

/** `POST /api/workspace/process/undo` and `…/discard`. */
export interface ProcessActionResponse {
  ok: boolean;
  error?: string;
}

export interface ProcessLedgerSource {
  list(workSessionId: number, signal?: AbortSignal): Promise<ProcessLedgerEntry[]>;
  undo(mutationId: number): Promise<void>;
  discard(mutationId: number): Promise<void>;
}

/**
 * Read the server's own message when there is one.
 *
 * The chokepoint's refusals are written for an operator to read — "Ending is
 * terminal: resumeSession refuses an ended session" — and replacing them with
 * "HTTP 409" would throw away the only part of the response that explains
 * anything. `HTTP <status>` is the fallback for a response that carries no
 * message at all.
 */
async function failureMessage(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  return json?.error || `HTTP ${res.status}`;
}

export const processLedgerSource: ProcessLedgerSource = {
  async list(workSessionId, signal) {
    const res = await fetch(`/api/workspace/process?sessionId=${encodeURIComponent(String(workSessionId))}`, {
      // A ledger the operator is actively changing must never come from cache;
      // a stale list would offer undo on something already undone.
      cache: 'no-store',
      signal,
    });
    if (!res.ok) throw new Error(await failureMessage(res));
    const json = (await res.json()) as ProcessLedgerResponse;
    return json.entries ?? [];
  },

  async undo(mutationId) {
    const res = await fetch('/api/workspace/process/undo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutationId }),
    });
    if (!res.ok) throw new Error(await failureMessage(res));
  },

  async discard(mutationId) {
    const res = await fetch('/api/workspace/process/discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutationId }),
    });
    if (!res.ok) throw new Error(await failureMessage(res));
  },
};
