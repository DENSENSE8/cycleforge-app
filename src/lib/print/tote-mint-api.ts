/**
 * Mint door for bulk tote runs — the tote twin of `registerLocations`.
 *
 * A tote's identity is a database serial (`handling_units.code` is stamped
 * `H-{id}` by a BEFORE INSERT trigger), so unlike a bin — whose code the
 * builder derives from zone/aisle/bay before anything is written — a tote
 * sticker cannot exist before its row does. This is the call that makes the
 * rows, and `printHandlingUnitLabelRun` prints exactly what it returns.
 *
 * Callers: useStaffPrintBridgeHost (the desk host that fulfils `/m/print`
 * tote jobs).
 */

import type { HandlingUnitLabelPayload } from '@/lib/print/printHandlingUnitLabel';
import { parseHouseToteId } from '@/lib/print/labelCopies';

type BulkMintResponse = {
  success?: boolean;
  error?: string;
  handling_units?: Array<{
    id: number;
    code: string | null;
  }>;
};

/**
 * Mint `count` totes and return them as label payloads, ascending by id.
 * Throws on a non-OK response so `printHandlingUnitLabelRun` reports
 * `mint_failed` and prints nothing.
 *
 * `idempotencyKey` MUST be passed by any caller whose trigger can be
 * redelivered. The desk host takes tote jobs off an Ably channel, and an
 * at-least-once redelivery (or a second desk signed in as the same staffer)
 * would otherwise mint a second batch of boxes nobody asked for — orphan rows
 * with no paper. Keyed on the job's `request_id`, the replay returns the FIRST
 * batch and reprints exactly those plates.
 */
export async function mintTotesForPrint(
  count: number,
  idempotencyKey?: string | null,
): Promise<HandlingUnitLabelPayload[]> {
  const res = await fetch('/api/handling-units/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ count, idempotencyKey: idempotencyKey ?? undefined }),
  });
  const body = (await res.json().catch(() => null)) as BulkMintResponse | null;
  if (!res.ok || !body?.success || !Array.isArray(body.handling_units)) {
    throw new Error(body?.error || `Could not mint ${count} tote${count === 1 ? '' : 's'}`);
  }

  // The plate carries the kicker and the ID, nothing else (operator ruling
  // 2026-09-15), so a minted box needs no other field to print.
  return body.handling_units.map((box) => ({
    handlingUnitId: box.id,
    code: box.code,
  }));
}

/**
 * Reprint from a typed number — no GET. `25` / `H-25` is plate `H-25`.
 * Lookup 404'd because digits were treated as a live `handling_units.id`,
 * and most reprint numbers are just the house handle the operator wants
 * on paper, not a row that has to exist first.
 *
 * Callers: TotePlateWorkspace, useStaffPrintBridgeHost.
 * User: "getting tote 25 not found why is that, for the reprint, simplify this now"
 */
export function toteReprintFromTyped(raw: string): HandlingUnitLabelPayload {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) throw new Error('Type a tote number');
  const id = parseHouseToteId(trimmed);
  if (id == null) {
    return { handlingUnitId: 0, code: trimmed };
  }
  return { handlingUnitId: id, code: `H-${id}` };
}
