/**
 * `GET /api/nav/fulfilled` answers the Records sheet's LINES; the board and
 * the phone show one card per ORDER. Pure and client-safe, so the desk board
 * and `/m/fulfilled` fold lines the same way.
 */

import type { NavLocateEntry, NavLocateFacts } from '@/lib/nav/context/schema';

/**
 * An order's head is its first line, carrying how many lines it holds
 * (`lineCount`, the card's "+N") and its newest note; the journey (bucket,
 * clock, mention) is the order's on every line already. In first-seen order,
 * so the read's sort holds.
 */
export function fulfilledOrderHeads<E extends NavLocateEntry>(lines: readonly E[]): E[] {
  const orders = new Map<string, E[]>();
  for (const line of lines) {
    const key = line.facts?.orderKey ?? line.key ?? line.ref;
    const held = orders.get(key);
    if (held) held.push(line);
    else orders.set(key, [line]);
  }
  return [...orders.values()].map((held) => {
    const head = held[0]!;
    if (held.length === 1 || !head.facts) return head;
    const lastNote = held.reduce<NavLocateFacts['lastNote']>((best, line) => {
      const note = line.facts?.lastNote ?? null;
      return note && (!best || Date.parse(note.at) > Date.parse(best.at)) ? note : (best ?? null);
    }, null);
    return { ...head, facts: { ...head.facts, lineCount: held.length, lastNote } };
  });
}
