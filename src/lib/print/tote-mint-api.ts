/** Mint door for bulk tote runs — the tote twin of `registerLocations`. */

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

/** Mint `count` totes and return them as label payloads, ascending by id. */
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

/** Reprint from a typed number — no GET. */
export function toteReprintFromTyped(raw: string): HandlingUnitLabelPayload {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) throw new Error('Type a tote number');
  const id = parseHouseToteId(trimmed);
  if (id == null) {
    return { handlingUnitId: 0, code: trimmed };
  }
  return { handlingUnitId: id, code: `H-${id}` };
}
