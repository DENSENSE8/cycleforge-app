/**
 * Station Displays carton Macro floor — exposed single-row action descriptors.
 *
 * Icon row (full-width justify-between): More · Print · Edit · Delete.
 * Overflow `⋯` holds secondary verbs (Resolve when unfound).
 */

/** Readiness-picked primary CTA (Print when matched; Resolve when unfound). */
export function stationDisplaysFloorPrimaryAction(input: {
  unfound: boolean;
}): { key: 'print' | 'link'; label: string; shortcut: 'Enter' } {
  if (input.unfound) {
    return { key: 'link', label: 'Resolve', shortcut: 'Enter' };
  }
  return { key: 'print', label: 'Print', shortcut: 'Enter' };
}

/** Overflow `⋯` items — Resolve when unfound; empty when matched. */
export function stationDisplaysFloorMoreItems(input: {
  unfound: boolean;
}): ReadonlyArray<{ key: 'link'; label: string }> {
  if (input.unfound) {
    return [{ key: 'link', label: 'Resolve' }];
  }
  return [];
}
