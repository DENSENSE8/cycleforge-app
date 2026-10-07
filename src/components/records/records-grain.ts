/**
 * The Records sheet's grain and write targets — pure, client-safe. A row is
 * one LINE (`NavLocateEntry`, key `out:<orders.id>` / `in:<receiving_line.id>`,
 * a pasted number that matched nothing `miss:<KEY>`); a condensed grain only
 * folds lines under a head and sets what a bulk action touches (handoff
 * 2026-10-06 §4.2: at order grain, every line of the order).
 */

import type { NavLocateEntry } from '@/lib/nav/context/schema';
import type { RecordsGrain } from '@/lib/nav/records/params';
import { parseRefList, type RefSelection } from '@/lib/receiving/reconcile';
import type { RecordActionResponse, RecordTarget } from '@/lib/records/sheet-actions-contract';

/** A line's group at a condensed grain (null = a row of its own); `line` folds nothing. */
export const RECORDS_GROUP_KEY: Readonly<Record<RecordsGrain, ((entry: NavLocateEntry) => string | null) | null>> = {
  line: null,
  order: (entry) => entry.facts?.orderKey ?? null,
  item: (entry) => (entry.facts?.itemNumber ? `item:${entry.facts.itemNumber}` : null),
  product: (entry) => entry.facts?.productKey ?? null,
};

/** A line's row key (the server's `key`; a ref-only entry is its ref). */
export function recordsEntryKey(entry: NavLocateEntry): string {
  return entry.key ?? entry.ref;
}

/** The checked units' lines: every loaded line whose unit — its group at a condensed grain, else itself — is checked. */
export function selectedRecordLines<E extends NavLocateEntry>(entries: readonly E[], keys: ReadonlySet<string>, grain: RecordsGrain): E[] {
  if (keys.size === 0) return [];
  const groupOf = RECORDS_GROUP_KEY[grain];
  return entries.filter((entry) => keys.has(groupOf?.(entry) ?? recordsEntryKey(entry)));
}

/** A line's write target; null for a pasted number that matched nothing. */
export function recordTargetOf(entry: NavLocateEntry): RecordTarget | null {
  const facts = entry.facts;
  return facts?.direction && facts.recordId ? { direction: facts.direction, id: facts.recordId } : null;
}

export function recordTargets(entries: readonly NavLocateEntry[]): RecordTarget[] {
  return entries.flatMap((entry) => recordTargetOf(entry) ?? []);
}

/**
 * An order-number change at the grain shown, widened where the server
 * requires it: an inbound line renames its inbound order, so every loaded
 * line of that order goes with it.
 */
export function orderNumberTargets(lines: readonly NavLocateEntry[], loaded: readonly NavLocateEntry[]): RecordTarget[] {
  const inboundOrders = new Set(lines.flatMap((line) => (line.facts?.direction === 'inbound' && line.facts.orderKey ? [line.facts.orderKey] : [])));
  const widened = loaded.filter(
    (entry) => entry.facts?.direction === 'inbound' && entry.facts.orderKey != null && inboundOrders.has(entry.facts.orderKey),
  );
  const seen = new Set<string>();
  return recordTargets([...lines, ...widened]).filter((target) => {
    const key = `${target.direction}:${target.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One write's answer, for its toast: how many lines took it and each refusal reason with its count. */
export function summarizeRecordResults(response: RecordActionResponse): { done: number; refused: { reason: string; count: number }[] } {
  const reasons = new Map<string, number>();
  let done = 0;
  for (const result of response.results) {
    if (result.outcome === 'done') done += 1;
    else {
      const reason = result.reason ?? 'Refused';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  return { done, refused: [...reasons].map(([reason, count]) => ({ reason, count })) };
}

/**
 * The pasted numbers that brought these lines in — every ref whose canonical
 * key (`parseRefList`, the paste's own parse) is one of the lines'
 * identifiers: order #, tracking, PO, or a miss's own key. "Remove from
 * list" drops exactly these from `?refs=`.
 */
export function refsOfLines(selection: RefSelection, lines: readonly NavLocateEntry[]): string[] {
  const keys = new Set<string>();
  for (const line of lines) {
    if (line.key?.startsWith('miss:')) keys.add(line.key.slice('miss:'.length));
    const facts = line.facts;
    const ids = [line.ref, facts?.orderNumber, facts?.tracking, ...(facts?.trackings ?? []), facts?.po];
    for (const id of ids) if (id) for (const key of parseRefList(id).keys) keys.add(key);
  }
  return selection.refs.filter((_, index) => keys.has(selection.keys[index]!));
}
