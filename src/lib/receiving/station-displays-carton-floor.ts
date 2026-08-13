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

/** Equal-fill carton Macro peers. More · Edit · Delete always paint. */
export type CartonFloorPeer = 'more' | 'sync' | 'print' | 'edit' | 'delete';

/**
 * Peer order for {@link CartonDisplaysActionFloor}.
 * Unbox: Print+Sync (5). Arrival: Sync only (4). Testing: neither (3).
 */
export function cartonFloorPeerOrder(input: {
  print?: boolean;
  sync?: boolean;
}): readonly CartonFloorPeer[] {
  const peers: CartonFloorPeer[] = ['more'];
  if (input.sync) peers.push('sync');
  if (input.print) peers.push('print');
  peers.push('edit', 'delete');
  return peers;
}

export type CartonInventoryRefreshFeedback =
  | { kind: 'success'; title: string; description?: string }
  | { kind: 'warning'; title: string; description?: string }
  | { kind: 'error'; title: string; description?: string };

/** Toast face for a carton inventory-dossier pull (Unbox / Arrival Sync). */
export function cartonInventoryRefreshFeedback(
  result: unknown,
): CartonInventoryRefreshFeedback {
  if (result && typeof result === 'object' && 'ok' in result) {
    const r = result as { ok: unknown; painted?: unknown; error?: unknown };
    const error = typeof r.error === 'string' ? r.error : undefined;
    if (r.ok) {
      return {
        kind: 'success',
        title: 'Inventory refreshed',
        description: 'Pulled latest status, notes, and lines from inventory.',
      };
    }
    if (r.painted) {
      return {
        kind: 'warning',
        title: 'Inventory status updated locally',
        description: error,
      };
    }
    return {
      kind: 'error',
      title: 'Inventory refresh failed',
      description: error,
    };
  }
  return { kind: 'success', title: 'Inventory refreshed' };
}
