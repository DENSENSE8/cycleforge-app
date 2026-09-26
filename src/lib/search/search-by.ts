/** Header search-by — the Warehouse OS axis picker, projected onto the global find field. */

import { looksLikeMarketplaceOrderNumber } from '@/lib/search/looks-like-marketplace-order-number';
import { looksLikeIdentifier } from '@/lib/search/search-hit';

/** Display order, left to right. */
export const SEARCH_BY_SCOPES = [
  'order',
  'tracking',
  'serial',
  'ticket',
  'internal',
] as const;
export type SearchByScope = (typeof SEARCH_BY_SCOPES)[number];

export function searchByPickerCount(): number {
  return SEARCH_BY_SCOPES.length;
}

export function searchByPickerScope(index: number): SearchByScope | null {
  return SEARCH_BY_SCOPES[index] ?? null;
}

export function searchByPickerValue(index: number): string {
  return searchByPickerScope(index) ?? 'internal';
}

const SEARCH_BY_SCOPE_SET = new Set<string>(SEARCH_BY_SCOPES);

/** Operator-facing method name — "Order number", not a plural kind word. */
/** Method names as they appear on the pill and in the placeholder. */
/** Method names as they appear on the pill. */
export const SEARCH_BY_METHOD_LABEL: Readonly<Record<SearchByScope, string>> = {
  internal: 'ID',
  order: 'Order',
  tracking: 'Tracking',
  serial: 'Serial',
  ticket: 'Ticket',
};

export const SEARCH_BY_METHOD_HINT: Readonly<Record<SearchByScope, string>> = {
  internal: 'Shipment, carton R-id, unit, QR',
  order: 'Marketplace order #',
  tracking: 'Carrier tracking',
  serial: 'Unit serial',
  ticket: 'Support or repair ticket',
};

/** Keyboard hint in the picker. Ticket uses `#` so it does not collide with tracking's T. */
const SEARCH_BY_SHORTCUT: Readonly<Record<SearchByScope, string | null>> = {
  internal: 'I',
  order: 'O',
  tracking: 'T',
  serial: 'S',
  ticket: '#',
};

/** Placeholder for the field once a method is chosen. */
export function searchByPlaceholder(scope: SearchByScope): string {
  if (scope === 'internal') return 'R-id, shipment, QR…';
  return `${SEARCH_BY_METHOD_HINT[scope]}…`;
}

export function searchByShortcut(scope: SearchByScope): string | null {
  return SEARCH_BY_SHORTCUT[scope];
}

/** Axis sent to `/api/global-search` from the header field. */
export function headerFindSearchAxis(
  methodChosen: boolean,
  axisScope: SearchByScope,
  query: string,
): SearchByScope | undefined {
  if (looksLikeMarketplaceOrderNumber(query)) {
    if (methodChosen && (axisScope === 'serial' || axisScope === 'tracking' || axisScope === 'ticket')) {
      return axisScope;
    }
    if (methodChosen && axisScope === 'order') return 'order';
    return undefined;
  }
  if (methodChosen) return axisScope;
  return undefined;
}

export function headerFindEmptyMessage(
  query: string,
  axis: SearchByScope | undefined,
): string {
  const q = query.trim();
  if (axis === 'serial') return 'No serial number found in the system';
  if (axis === 'order' || (axis == null && looksLikeIdentifier(q))) {
    return 'No order number found in the system';
  }
  return `No matches for “${q}”`;
}

export function parseSearchByScope(raw: string | null | undefined): SearchByScope {
  if (!raw) return 'internal';
  const v = raw.trim().toLowerCase();
  // Legacy header "All" is Internal ID — never fan out across every entity.
  if (v === 'all') return 'internal';
  return SEARCH_BY_SCOPE_SET.has(v) ? (v as SearchByScope) : 'internal';
}

/** Same method again clears back to Internal ID (worktree `toggleAxisScope`). */
export function toggleSearchByScope(
  current: SearchByScope,
  next: SearchByScope,
): SearchByScope {
  if (next === 'internal') return 'internal';
  return current === next ? 'internal' : next;
}

/**
 * Client-side preview filter. Axis-scoped fetches already narrow
 * server-side; this is the last guard so a mixed payload cannot leak
 * into a scoped dropdown.
 */
export function filterHitsBySearchBy<T extends { entityType: string; matchField?: string }>(
  hits: readonly T[],
  scope: SearchByScope,
): T[] {
  if (scope === 'internal') {
    return hits.filter(
      (h) =>
        h.matchField === 'id' ||
        h.matchField === 'shipment' ||
        h.matchField === 'receiving',
    );
  }
  if (scope === 'order') {
    return hits.filter(
      (h) =>
        h.entityType === 'order' ||
        (h.entityType === 'receiving' && h.matchField === 'receiving'),
    );
  }
  if (scope === 'serial') {
    return hits.filter((h) => h.entityType === 'unit' || h.matchField === 'serial');
  }
  if (scope === 'ticket') {
    return hits.filter(
      (h) => h.matchField === 'support_ticket' || h.entityType === 'repair',
    );
  }
  return hits.filter(
    (h) =>
      h.matchField === 'tracking' ||
      h.entityType === 'exception' ||
      h.entityType === 'import_exception' ||
      h.entityType === 'order',
  );
}
