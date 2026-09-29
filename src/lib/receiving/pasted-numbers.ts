/**
 * A pasted Inbound list read NUMBER by number — the triage unit while
 * `?ref_in=` is set (HANDOFF-bulk-identify Feature 2). Each receiving line
 * belongs to the first pasted number (paste order) it carries; a number no
 * line carries still gets its place, so the ledger shows every number pasted.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  parseRefInParam,
  RECON_PARAM,
  RECON_REASON_PARAM,
  REF_IN_PARAM,
  rowRefKeys,
  serializeRefIn,
  type ReconEntry,
} from '@/lib/receiving/reconcile';

export interface PastedNumber {
  entry: ReconEntry;
  /** The lines this number holds (no earlier shown number carries them), in the host's order. */
  lines: ReceivingLineRow[];
  /** No lines of its own, but an earlier pasted number's card holds lines carrying it: that number's string. */
  sharedWith: string | null;
}

/** A Find over the list: a number stays when its string matches, or with only its lines that match. */
export interface PastedNumberFind {
  query: string;
  matches: (row: ReceivingLineRow) => boolean;
}

/** `entries` (already status-filtered, paste order) → one {@link PastedNumber} each, narrowed by `find`. */
export function pastedNumbers(
  entries: readonly ReconEntry[],
  rows: readonly ReceivingLineRow[],
  find: PastedNumberFind | null = null,
): PastedNumber[] {
  const index = new Map<string, number>();
  entries.forEach((entry, i) => {
    if (!index.has(entry.key)) index.set(entry.key, i);
  });
  const held: ReceivingLineRow[][] = entries.map(() => []);
  const sharedWith = new Map<number, number>();
  for (const row of rows) {
    const carried: number[] = [];
    for (const key of rowRefKeys(row)) {
      const at = index.get(key);
      if (at !== undefined) carried.push(at);
    }
    if (carried.length === 0) continue;
    const first = Math.min(...carried);
    held[first]!.push(row);
    for (const at of carried) if (at !== first && !sharedWith.has(at)) sharedWith.set(at, first);
  }
  const numbers = entries.map((entry, i): PastedNumber => {
    const lines = held[i]!;
    const owner = lines.length === 0 ? sharedWith.get(i) : undefined;
    return { entry, lines, sharedWith: owner === undefined ? null : entries[owner]!.ref };
  });
  const query = find?.query.trim().toLowerCase() ?? '';
  if (!find || !query) return numbers;
  return numbers.flatMap((number) => {
    if (number.entry.ref.toLowerCase().includes(query)) return [number];
    const lines = number.lines.filter(find.matches);
    return lines.length > 0 ? [{ ...number, lines }] : [];
  });
}

/**
 * The record id of a number no line carries: negative (never a line id),
 * non-zero, and stable for its key — `?openLine=` survives a reload and the
 * other numbers leaving the list.
 */
export function pastedNumberPlaceholderId(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return -(1 + (hash % 2_000_000_000));
}

/**
 * Drop `keys` from the pasted list in `params` (the live query string). The
 * last number out also drops the status and reason filters. Returns the refs
 * left.
 */
export function removePastedNumbers(params: URLSearchParams, keys: ReadonlySet<string>): string[] {
  const selection = parseRefInParam(params.get(REF_IN_PARAM));
  const left = selection.refs.filter((_, i) => !keys.has(selection.keys[i]!));
  params.delete('page');
  if (left.length === 0) {
    params.delete(REF_IN_PARAM);
    params.delete(RECON_PARAM);
    params.delete(RECON_REASON_PARAM);
  } else {
    params.set(REF_IN_PARAM, serializeRefIn(left));
  }
  return left;
}
