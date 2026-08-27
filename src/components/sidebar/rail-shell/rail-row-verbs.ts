/**
 * The read verbs every recent rail can already perform, built from what the feed
 * has ALREADY declared — no per-rail menu wiring.
 *
 * A rail publishes `getCollapsePinFacts` so its parked collapse-strip peek can
 * paint typed, copyable identity chips (order · PO · SKU · tracking · serial ·
 * ticket · bin). Those are exactly the values an operator wants out of a row
 * menu, so the ⋮ reads the same list rather than each rail hand-rolling a
 * second one that drifts. Add a fact and the row gains a Copy item; the rail
 * file does not change.
 *
 * Dismiss is deliberately absent here. It is not a display concern — it writes
 * a `staff_rail_exclusions` row, and that table's feed keys and entity types
 * cover the receiving surfaces only (`RECEIVING_RAIL_FEED_KEYS`). A rail with
 * nowhere to record a dismiss must omit the verb, never show a dead one; see
 * `@/lib/receiving/rail/row-actions` for the feeds that do have it.
 */

import type { RailPeekFact } from './RailPeekIdentityFacts';
import type { RailRowAction } from './rail-row-actions';

/** Identity tone → the word the operator reads in the menu and the toast. */
const FACT_LABEL: Record<RailPeekFact['tone'], string> = {
  order: 'order',
  po: 'PO',
  sku: 'SKU',
  tracking: 'tracking',
  serial: 'serial',
  ticket: 'ticket',
  bin: 'bin',
};

/**
 * The identity verbs — one Copy per fact the row actually carries, plus Share
 * when the rail can hand out a link to the record.
 *
 * There is no Open: clicking the row already opens it, so an Open item would
 * only repeat the gesture that opened the menu.
 *
 * Blank facts are dropped even when they set `keepEmpty` — that flag exists so
 * the peek card can hold a column with a `----` placeholder, and a menu item
 * that copies a placeholder is a dead end wearing an enabled item's clothes.
 * A repeated tone keeps its position and gets a distinct id, so a row with two
 * serials offers two Copy serial items rather than silently losing one.
 */
export function railIdentityActions(
  ctx: {
    /** Injected so this module stays DOM-free — see `./rail-row-copy`. */
    copy: (value: string, label: string) => void;
    /** Null when the rail has no shareable link for the row: omitted, not dead. */
    share?: (() => void) | null;
  },
  facts: readonly RailPeekFact[] | null | undefined,
): RailRowAction[] {
  const actions: RailRowAction[] = [];

  const seen = new Map<string, number>();
  for (const fact of facts ?? []) {
    const value = (fact.value ?? '').trim();
    if (!value) continue;
    const label = FACT_LABEL[fact.tone];
    const n = (seen.get(fact.tone) ?? 0) + 1;
    seen.set(fact.tone, n);
    actions.push({
      id: n === 1 ? `copy:${fact.tone}` : `copy:${fact.tone}:${n}`,
      label: `Copy ${label}`,
      icon: 'copy',
      group: 'read',
      onSelect: () => ctx.copy(value, label),
    });
  }

  if (ctx.share) {
    actions.push({
      id: 'share',
      label: 'Share link',
      icon: 'share',
      group: 'read',
      onSelect: ctx.share,
    });
  }

  return actions;
}
