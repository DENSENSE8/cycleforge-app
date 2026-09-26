/** Sidebar copy + search parameter normalization for `/receiving?mode=history`. */

export type ReceivingHistorySearchField =
  | 'all'
  | 'po'
  | 'tracking'
  | 'sku'
  | 'product'
  | 'serial';

export type ReceivingHistorySearchScope = 'all' | 'zoho_po' | 'unmatched';

/** Table + sidebar sync on `/receiving?mode=history` via query params. */
export const RECEIVING_HISTORY_URL_PARAMS = {
  q: 'rh_q',
  field: 'rh_field',
  scope: 'rh_scope',
} as const;

/** Mutate receiving history URL params (caller runs `router.replace`). */
export function setReceivingHistoryUrlParams(
  searchParams: URLSearchParams,
  patch: { q?: string | null; field?: ReceivingHistorySearchField; scope?: ReceivingHistorySearchScope },
) {
  const next = new URLSearchParams(searchParams.toString());
  if (patch.q !== undefined) {
    const t = (patch.q ?? '').trim();
    if (t) next.set(RECEIVING_HISTORY_URL_PARAMS.q, t);
    else next.delete(RECEIVING_HISTORY_URL_PARAMS.q);
  }
  if (patch.field !== undefined) {
    if (patch.field === 'all') next.delete(RECEIVING_HISTORY_URL_PARAMS.field);
    else next.set(RECEIVING_HISTORY_URL_PARAMS.field, patch.field);
  }
  if (patch.scope !== undefined) {
    if (patch.scope === 'all') next.delete(RECEIVING_HISTORY_URL_PARAMS.scope);
    else next.set(RECEIVING_HISTORY_URL_PARAMS.scope, patch.scope);
  }
  return next;
}

interface ReceivingHistoryFieldConfig {
  id: ReceivingHistorySearchField;
  label: string;
  placeholder: string;
}

const RECEIVING_HISTORY_SEARCH_FIELDS: ReceivingHistoryFieldConfig[] = [
  {
    id: 'all',
    label: 'All',
    placeholder: 'Search purchase order #, tracking, SKU, title, or serial #',
  },
  {
    id: 'po',
    label: 'Purchase order #',
    placeholder: 'Search purchase order #',
  },
  {
    id: 'tracking',
    label: 'Tracking #',
    placeholder: 'Search tracking number',
  },
  {
    id: 'sku',
    label: 'SKU',
    placeholder: 'Search SKU or Zoho item id',
  },
  {
    id: 'product',
    label: 'Product',
    placeholder: 'Search product title',
  },
  {
    id: 'serial',
    label: 'Serial #',
    placeholder: 'Search serial number',
  },
];

const FIELD_MAP = RECEIVING_HISTORY_SEARCH_FIELDS.reduce<
  Record<ReceivingHistorySearchField, ReceivingHistoryFieldConfig>
>((acc, f) => {
  acc[f.id] = f;
  return acc;
}, {} as Record<ReceivingHistorySearchField, ReceivingHistoryFieldConfig>);

const FIELD_IDS = new Set<ReceivingHistorySearchField>(
  RECEIVING_HISTORY_SEARCH_FIELDS.map((f) => f.id),
);

export function normalizeReceivingHistorySearchField(
  raw: string | null | undefined,
): ReceivingHistorySearchField {
  const v = String(raw || '').trim().toLowerCase() as ReceivingHistorySearchField;
  return FIELD_IDS.has(v) ? v : 'all';
}

/**
 * Wire tokens `?rh_field=` may carry (route-param hygiene).
 * Do not round-trip {@link normalizeReceivingHistorySearchField} — it coerces to `all`.
 */
export function parseReceivingHistorySearchFieldWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return FIELD_IDS.has(v as ReceivingHistorySearchField) ? v : null;
}

export function normalizeReceivingHistorySearchScope(
  raw: string | null | undefined,
): ReceivingHistorySearchScope {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'unmatched' || v === 'unfound') return 'unmatched';
  // PO-only scope removed from History UI — legacy bookmarks read as All.
  return 'all';
}

/**
 * Wire tokens `?rh_scope=` may carry (route-param hygiene), including legacy
 * `unfound` → reader maps to unmatched. Do not round-trip
 * {@link normalizeReceivingHistorySearchScope} — it folds `zoho_po` to `all`.
 */
export function parseReceivingHistorySearchScopeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === 'all' || v === 'zoho_po' || v === 'unmatched' || v === 'unfound') return v;
  return null;
}

function getReceivingHistoryPlaceholder(field: ReceivingHistorySearchField): string {
  return FIELD_MAP[field]?.placeholder ?? FIELD_MAP.all.placeholder;
}

/** Placeholder packages (no lines yet) only carry tracking — skip merge for these field modes. */
export function receivingHistorySkipsUnmatchedPlaceholders(
  field: ReceivingHistorySearchField,
): boolean {
  return field === 'sku' || field === 'product' || field === 'serial';
}
