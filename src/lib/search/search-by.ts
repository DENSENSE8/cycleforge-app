/**
 * Header search-by — the Warehouse OS axis picker, projected onto the
 * global find field. Ported from the warehouse-os worktree's `#` combobox
 * (entity kinds + axis scope). The header has no `#` trigger, so the
 * picker opens on click/focus of an empty field; a chosen axis becomes
 * an in-field chip and threads `?axis=` into `/api/global-search`.
 *
 * Header methods are Internal ID · order · tracking · serial · ticket.
 * There is no catch-all: Internal ID is Cycle Forge keys (shipment id,
 * R-id, unit handle) plus printed QR / Digital Link payloads. Phone is
 * not a header axis.
 *
 * DB-free, React-free.
 */

export const SEARCH_BY_SCOPES = [
  'internal',
  'order',
  'tracking',
  'serial',
  'ticket',
] as const;
export type SearchByScope = (typeof SEARCH_BY_SCOPES)[number];

/**
 * Empty-field picker option 0 is Recent searches (not an axis). Methods
 * follow at index 1… so Enter on an unmoved highlight opens history.
 */
export const SEARCH_BY_RECENTS_INDEX = 0;
export const SEARCH_BY_RECENTS_VALUE = 'recents';

export function searchByPickerCount(): number {
  return SEARCH_BY_SCOPES.length + 1;
}

/** Axis at a picker index, or null when the row is Recents. */
export function searchByPickerScope(index: number): SearchByScope | null {
  if (index <= SEARCH_BY_RECENTS_INDEX) return null;
  return SEARCH_BY_SCOPES[index - 1] ?? null;
}

export function searchByPickerValue(index: number): string {
  const scope = searchByPickerScope(index);
  return scope ?? SEARCH_BY_RECENTS_VALUE;
}

const SEARCH_BY_SCOPE_SET = new Set<string>(SEARCH_BY_SCOPES);

/** Operator-facing method name — "Order number", not a plural kind word. */
export const SEARCH_BY_METHOD_LABEL: Readonly<Record<SearchByScope, string>> = {
  internal: 'Internal ID',
  order: 'Order number',
  tracking: 'Tracking number',
  serial: 'Serial number',
  ticket: 'Ticket number',
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

export function searchByPlaceholder(scope: SearchByScope): string {
  if (scope === 'internal') return 'R-id, shipment, QR…';
  return `${SEARCH_BY_METHOD_LABEL[scope]}…`;
}

export function searchByShortcut(scope: SearchByScope): string | null {
  return SEARCH_BY_SHORTCUT[scope];
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
  if (scope === 'order') return hits.filter((h) => h.entityType === 'order');
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
