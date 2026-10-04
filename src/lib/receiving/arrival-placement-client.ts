/**
 * Client contract for Arrival urgency-shelf placement and the unbox-next queue
 * (`POST /api/receiving/[id]/placement`, `GET /api/receiving/unbox-next`).
 * Presentation lives in `src/components/mobile/v2/receiving/`; this file is
 * the wire shape and the fetches, shared by every surface that places cartons.
 */

import type { ArrivalShelf, ShelfSuggestion } from '@/lib/receiving/arrival-shelf-plan';
import type { ArrivalTierResolution } from '@/lib/receiving/arrival-tier';

export interface PlacementSuggestAnswer {
  tier: ArrivalTierResolution;
  suggestion: ShelfSuggestion;
  currentShelf: ArrivalShelf | null;
}

export type PlacementConfirmAnswer =
  | { ok: true; shelf: ArrivalShelf }
  | { ok: false; message: string; reason: string | null };

export interface UnboxNextAnswer {
  shelvesConfigured: boolean;
  items: Array<{
    receivingId: number;
    tier: number;
    tierSource: string;
    shelfId: number | null;
    shelfCode: string | null;
    shelfFace: string | null;
    doorReceivedAt: string | null;
    poNumber: string | null;
    vendor: string | null;
    sourcePlatform: string | null;
    tracking: string | null;
    lineCount: number;
  }>;
}

async function postPlacement(receivingId: number, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`/api/receiving/${receivingId}/placement`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json: json && typeof json === 'object' ? (json as Record<string, unknown>) : {} };
}

export async function fetchPlacementSuggestion(receivingId: number): Promise<PlacementSuggestAnswer> {
  const { status, json } = await postPlacement(receivingId, { action: 'suggest' });
  if (status !== 200 || json.success !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : `Placement lookup failed (${status})`);
  }
  // The route's own response shape (see placement/route.ts) — server-authored.
  return json as unknown as PlacementSuggestAnswer;
}

export async function confirmPlacementScan(
  receivingId: number,
  input: { scanned: string; clientEventId: string; surface: string },
): Promise<PlacementConfirmAnswer> {
  const { status, json } = await postPlacement(receivingId, { action: 'confirm', ...input });
  if (status === 200 && json.success === true && json.shelf && typeof json.shelf === 'object') {
    // Server-authored shelf (ArrivalShelf) — see placement/route.ts.
    const shelf = json.shelf as ArrivalShelf;
    return { ok: true, shelf };
  }
  return {
    ok: false,
    message: typeof json.error === 'string' ? json.error : `Could not place the carton (${status})`,
    reason: typeof json.reason === 'string' ? json.reason : null,
  };
}

export async function fetchUnboxNext(): Promise<UnboxNextAnswer> {
  const res = await fetch('/api/receiving/unbox-next', { credentials: 'include' });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok || !json || typeof json !== 'object') throw new Error(`Unbox queue failed (${res.status})`);
  // The route's own response shape (see unbox-next/route.ts) — server-authored.
  return json as UnboxNextAnswer;
}
