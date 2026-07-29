/**
 * Sidebar copy + search parameter normalization for `/receiving?mode=history`.
 * Mirrors the dashboard shipped-tab field/slider model (see `shipped-search.ts`).
 * Search field / scope controls live in `HistoryWorkspaceHeader` (workbench chrome).
 */

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

export interface ReceivingHistoryFieldConfig {
  id: ReceivingHistorySearchField;
  label: string;
  placeholder: string;
}

export const RECEIVING_HISTORY_SEARCH_FIELDS: ReceivingHistoryFieldConfig[] = [
  {
    id: 'all',
    label: 'All',
    placeholder: 'Search PO #, tracking, SKU, title, or serial #',
  },
  {
    id: 'po',
    label: 'PO #',
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

export function normalizeReceivingHistorySearchScope(
  raw: string | null | undefined,
): ReceivingHistorySearchScope {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'unmatched' || v === 'unfound') return 'unmatched';
  // PO-only scope removed from History UI — legacy bookmarks read as All.
  return 'all';
}

export function getReceivingHistoryPlaceholder(field: ReceivingHistorySearchField): string {
  return FIELD_MAP[field]?.placeholder ?? FIELD_MAP.all.placeholder;
}

/** Placeholder packages (no lines yet) only carry tracking — skip merge for these field modes. */
export function receivingHistorySkipsUnmatchedPlaceholders(
  field: ReceivingHistorySearchField,
): boolean {
  return field === 'sku' || field === 'product' || field === 'serial';
}
