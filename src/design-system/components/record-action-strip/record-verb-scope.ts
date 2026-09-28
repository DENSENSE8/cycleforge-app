/**
 * Law 5 — the selection bar paints the SAME verbs in the SAME order whether one
 * record or many are checked. A verb whose `scope` does not fit the check-set
 * keeps its place, disabled with the reason, so the bar never reflows and a
 * hotkey never silently acts on only the lead record.
 */

import type { RecordActionVerb } from './RecordActionStrip';

export function scopeRecordVerbs(
  verbs: readonly RecordActionVerb[],
  checkedCount: number,
  noun: { one: string; many: string },
): RecordActionVerb[] {
  return verbs.map((verb) => {
    const scope = verb.scope ?? 'both';
    const reason =
      scope === 'single' && checkedCount > 1
        ? `One ${noun.one} at a time`
        : scope === 'bulk' && checkedCount < 2
          ? `Check two or more ${noun.many}`
          : null;
    return reason == null || verb.disabled ? verb : { ...verb, disabled: true, disabledReason: reason };
  });
}

/**
 * Letters two or more verbs claim (case-insensitive). The strip's key handler
 * runs the FIRST match, so a duplicate silently shadows the later verb —
 * surfaced as a development warning by `useRecordActionStripKeys`.
 */
export function findDuplicateVerbHotkeys(
  verbs: readonly Pick<RecordActionVerb, 'id' | 'hotkey'>[],
): { hotkey: string; ids: string[] }[] {
  const byKey = new Map<string, string[]>();
  for (const verb of verbs) {
    const key = verb.hotkey?.trim().toLowerCase();
    if (!key) continue;
    const ids = byKey.get(key);
    if (ids) ids.push(verb.id);
    else byKey.set(key, [verb.id]);
  }
  return [...byKey]
    .filter(([, ids]) => ids.length > 1)
    .map(([hotkey, ids]) => ({ hotkey, ids }));
}
