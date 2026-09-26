/** The read verbs every recent rail can already perform, built from what the feed has ALREADY declared — no per-rail menu wiring. */

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

/** The identity verbs — one Copy per fact the row actually carries, plus Share when the rail can hand out a link to the record. */
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
