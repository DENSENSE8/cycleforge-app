'use client';

/**
 * The Unbox station's scan feedback — the header's top-left line plus its
 * history (newest first, this tab's session). Pure model + tests:
 * `unbox-scan-feedback.ts`.
 *
 *  1. {@link checkUnboxScanVerdict} — at scan time, found / unfound in one
 *     round trip (`/api/receiving/scan-verdict`) while lookup-po still opens
 *     the carton.
 *  2. {@link pairUnboxUnfoundTicket} — once lookup-po created the unfound
 *     carton, search Zendesk for the tracking and link the ticket to it
 *     (`/api/receiving/zendesk-claim/link`, the same route Claim → Link uses).
 *  3. {@link noteUnboxTicketLinked} — a ticket linked by hand (Claim → Link)
 *     lands on the same entry.
 */

import { useSyncExternalStore } from 'react';
import {
  decideUnfoundPairing,
  findFeedbackForCarton,
  pairedFrom,
  patchFeedback,
  pushFeedback,
  type UnboxScanFeedback,
  type UnboxTicketCandidate,
  type UnboxTicketPairing,
} from './unbox-scan-feedback';

interface UnboxScanFeedbackSnapshot {
  /** The entry the top-left line shows; null once retired (left /unbox). */
  readonly line: UnboxScanFeedback | null;
  readonly log: readonly UnboxScanFeedback[];
}

let log: readonly UnboxScanFeedback[] = [];
let lineId: number | null = null;
let nextId = 1;
let snapshot: UnboxScanFeedbackSnapshot = { line: null, log };
const EMPTY: UnboxScanFeedbackSnapshot = { line: null, log: [] };
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = { line: log.find((entry) => entry.id === lineId) ?? null, log };
  listeners.forEach((listener) => listener());
}

function patch(id: number, fields: Partial<Omit<UnboxScanFeedback, 'id'>>): void {
  const next = patchFeedback(log, id, fields);
  if (next === log) return;
  log = next;
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnboxScanFeedback(): UnboxScanFeedbackSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** Leaving the Unbox bench retires the line; the history stays. */
export function retireUnboxScanLine(): void {
  if (lineId == null) return;
  lineId = null;
  publish();
}

function begin(fields: Omit<UnboxScanFeedback, 'id' | 'at'>): number {
  const id = nextId++;
  log = pushFeedback(log, { id, at: Date.now(), ...fields });
  lineId = id;
  publish();
  return id;
}

/** Ask the server found / unfound for a scanned tracking; the newest scan owns the line. */
export async function checkUnboxScanVerdict(tracking: string): Promise<void> {
  const value = tracking.trim();
  if (!value) return;
  const id = begin({ tracking: value, receivingId: null, phase: 'checking', lineCount: 0, ticket: null });
  try {
    const res = await fetch(`/api/receiving/scan-verdict?tracking=${encodeURIComponent(value)}`, {
      cache: 'no-store',
    });
    const data = (await res.json()) as { verdict?: string; lineCount?: number; receivingId?: number | null };
    const current = log.find((entry) => entry.id === id);
    // lookup-po may already have said unfound (and started the ticket step).
    if (current?.phase === 'unfound') return;
    const phase = res.ok && (data.verdict === 'found' || data.verdict === 'unfound') ? data.verdict : 'error';
    const receivingId = Number(data.receivingId) > 0 ? Number(data.receivingId) : null;
    patch(id, { phase, lineCount: Number(data.lineCount) || 0, receivingId });
    // An unfound tracking that already has its carton (a rescan / reopen):
    // pair its ticket now instead of waiting for lookup-po. A brand-new carton
    // is paired from `applyUnmatchedCarton` once lookup-po mints it.
    if (phase === 'unfound' && receivingId != null) {
      void pairUnboxUnfoundTicket({ receivingId, tracking: value });
    }
  } catch {
    patch(id, { phase: 'error' });
  }
}

// ── ticket pairing ───────────────────────────────────────────────────────────

const LINK_ROUTE = '/api/receiving/zendesk-claim/link';
const inFlight = new Set<number>();

function toCandidate(raw: Record<string, unknown>): UnboxTicketCandidate | null {
  const id = Number(raw.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    linkedToThis: raw.linkedToThis === true,
  };
}

async function postLink(
  receivingId: number,
  ticket: UnboxTicketCandidate,
): Promise<{ ok: true; pairing: UnboxTicketPairing } | { ok: false; conflict: boolean }> {
  const res = await fetch(LINK_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receivingId, ticketId: ticket.id }),
  });
  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; subject?: string | null; ticketUrl?: string | null }
    | null;
  if (!res.ok || !data?.success) return { ok: false, conflict: res.status === 409 };
  return {
    ok: true,
    pairing: pairedFrom({
      ...ticket,
      subject: data.subject ?? ticket.subject,
      url: data.ticketUrl ?? ticket.url,
    }),
  };
}

/**
 * Search Zendesk for an unfound carton's tracking and link the ticket to the
 * carton (see `decideUnfoundPairing`). Each state lands on the scan's entry.
 */
export async function pairUnboxUnfoundTicket(args: { receivingId: number; tracking: string }): Promise<void> {
  const { receivingId } = args;
  const tracking = args.tracking.trim();
  if (!tracking || inFlight.has(receivingId)) return;
  inFlight.add(receivingId);
  const found = findFeedbackForCarton(log, receivingId, tracking);
  const id = found
    ? found.id
    : begin({ tracking, receivingId, phase: 'unfound', lineCount: 0, ticket: null });
  patch(id, { receivingId, phase: 'unfound', ticket: { state: 'searching' } });
  try {
    const params = new URLSearchParams({ receivingId: String(receivingId), query: tracking });
    const res = await fetch(`${LINK_ROUTE}?${params}`, { cache: 'no-store' });
    if (res.status === 503) {
      patch(id, { ticket: { state: 'not_connected' } });
      return;
    }
    const data = (await res.json().catch(() => null)) as { success?: boolean; tickets?: unknown } | null;
    if (!res.ok || !data?.success || !Array.isArray(data.tickets)) {
      patch(id, { ticket: { state: 'error' } });
      return;
    }
    const candidates = data.tickets
      .map((raw) => toCandidate(raw as Record<string, unknown>))
      .filter((t): t is UnboxTicketCandidate => t != null);
    const decision = decideUnfoundPairing(candidates);
    switch (decision.kind) {
      case 'already':
        patch(id, { ticket: pairedFrom(decision.ticket) });
        return;
      case 'choose':
        patch(id, { ticket: { state: 'choose', candidates: decision.candidates } });
        return;
      case 'none':
        patch(id, { ticket: { state: 'none' } });
        return;
      case 'link': {
        const linked = await postLink(receivingId, decision.ticket);
        // A race linked it elsewhere first: nothing left to pair automatically.
        patch(id, { ticket: linked.ok ? linked.pairing : { state: linked.conflict ? 'none' : 'error' } });
        return;
      }
    }
  } catch {
    patch(id, { ticket: { state: 'error' } });
  } finally {
    inFlight.delete(receivingId);
  }
}

/** The operator picked one of several matching tickets in the history. */
export async function pairUnboxTicketChoice(entryId: number, ticket: UnboxTicketCandidate): Promise<boolean> {
  const entry = log.find((e) => e.id === entryId);
  if (!entry?.receivingId) return false;
  const before = entry.ticket;
  patch(entryId, { ticket: { state: 'searching' } });
  try {
    const linked = await postLink(entry.receivingId, ticket);
    if (linked.ok) {
      patch(entryId, { ticket: linked.pairing });
      return true;
    }
    if (linked.conflict && before?.state === 'choose') {
      const rest = before.candidates.filter((c) => c.id !== ticket.id);
      patch(entryId, { ticket: rest.length > 0 ? { state: 'choose', candidates: rest } : { state: 'none' } });
      return false;
    }
    patch(entryId, { ticket: before });
    return false;
  } catch {
    patch(entryId, { ticket: before });
    return false;
  }
}

/** A ticket linked by hand (Claim → Link) to a carton this session scanned. */
export function noteUnboxTicketLinked(args: {
  receivingId: number;
  ticketId: number;
  subject: string | null;
  status?: string | null;
  url: string | null;
}): void {
  const entry = log.find((e) => e.receivingId === args.receivingId && e.phase === 'unfound');
  if (!entry) return;
  patch(entry.id, {
    ticket: {
      state: 'paired',
      ticketId: args.ticketId,
      subject: args.subject,
      status: args.status ?? null,
      url: args.url,
    },
  });
}
