/** Station Displays carton Macro verbs — top-band action descriptors. */

import { getLast8 } from '@/lib/copy-chip-format';

/** Readiness-picked primary CTA (Print when matched; Resolve when unfound). */
export function stationDisplaysFloorPrimaryAction(input: {
  unfound: boolean;
}): { key: 'print' | 'link'; label: string; shortcut: 'Enter' } {
  if (input.unfound) {
    return { key: 'link', label: 'Resolve', shortcut: 'Enter' };
  }
  return { key: 'print', label: 'Print', shortcut: 'Enter' };
}

/** A `⋮` row. `tone: 'danger'` paints destructive and sorts last. */
type CartonFloorMoreItem = {
  key: 'link' | 'delete';
  label: string;
  tone?: 'danger';
};

/**
 * `⋯` items — Resolve when unfound, then Delete.
 *
 * Delete is always present (the menu is never empty, so the trigger is never
 * disabled) and always last, separated from the navigational verbs above it.
 */
export function stationDisplaysFloorMoreItems(input: {
  unfound: boolean;
  /** Operator-facing carton noun from {@link cartonDeleteFace}. */
  deleteLabel: string;
}): ReadonlyArray<CartonFloorMoreItem> {
  const items: CartonFloorMoreItem[] = [];
  if (input.unfound) items.push({ key: 'link', label: 'Resolve' });
  items.push({ key: 'delete', label: input.deleteLabel, tone: 'danger' });
  return items;
}

/**
 * Carton Macro header peers. Edit and `⋯` always paint; Refresh and Print are
 * per-station slots. Delete is not a peer — it lives inside `⋯`.
 */
export type CartonFloorPeer = 'sync' | 'print' | 'edit' | 'more';

export type CartonDeleteIdentity = {
  receivingId: number;
  tracking?: string | null;
  poNumber?: string | null;
};

/**
 * Operator-facing noun for carton delete (arm tooltip, undo toast).
 * Tracking last-8 wins; else PO number; else `carton {id}`.
 */
export function cartonDeleteFace(input: CartonDeleteIdentity): string {
  const tracking = (input.tracking ?? '').trim();
  if (tracking) {
    const short = getLast8(tracking);
    if (short && short !== '---') return short;
  }
  const po = (input.poNumber ?? '').trim();
  if (po) return po;
  return `carton ${input.receivingId}`;
}

export function cartonDeleteLabels(face: string): {
  idleLabel: string;
  confirmLabel: string;
  deletedTitle: string;
} {
  return {
    idleLabel: `Delete ${face}`,
    confirmLabel: `Click again to delete ${face}`,
    deletedTitle: `${face} deleted`,
  };
}

/** Peer order for {@link CartonDisplaysActionFloor} — `⋯` is ALWAYS last, so it anchors the same trailing corner on every station… */
export function cartonFloorPeerOrder(input: {
  print?: boolean;
  sync?: boolean;
}): readonly CartonFloorPeer[] {
  const peers: CartonFloorPeer[] = [];
  if (input.sync) peers.push('sync');
  if (input.print) peers.push('print');
  peers.push('edit', 'more');
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
