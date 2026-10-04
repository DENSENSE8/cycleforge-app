/**
 * Shared helpers for the dashboard Sourcing hub (Queue / Scout / Watchlist).
 * Pure — no `'use client'`: the `/sourcing` route param spec runs these
 * parsers on the server too (`GET /api/nav/context`), where a client
 * reference cannot be called.
 */

type SourcingMode =
  | 'queue' | 'scout' | 'watchlist' | 'searches' | 'suppliers' | 'analytics'
  // Sourcing master data (admin dissolution): the model catalog lives on the
  // desk that consumes it. `?mode=compatibility` is parked → `/sourcing`.
  | 'models';

/** Live + legacy wire tokens `?mode=` may carry on `/sourcing`. */
const SOURCING_MODE_WIRE = [
  'queue',
  'scout',
  'watchlist',
  'searches',
  'suppliers',
  'analytics',
  'models',
  /** Legacy → scout */
  'lookup',
  /** Legacy → queue */
  'alerts',
] as const;

export function resolveSourcingMode(raw: string | null): SourcingMode {
  if (raw === 'scout' || raw === 'lookup') return 'scout';
  if (raw === 'watchlist') return 'watchlist';
  if (raw === 'searches') return 'searches';
  if (raw === 'suppliers') return 'suppliers';
  if (raw === 'analytics') return 'analytics';
  if (raw === 'models') return 'models';
  return 'queue'; // default; legacy 'alerts' lands here too
}

/**
 * Wire tokens for `/sourcing` hygiene. Includes default `queue` + legacy aliases
 * so old bookmarks reach {@link resolveSourcingMode}. Do not round-trip that
 * resolver — aliases rewrite (`lookup`→`scout`).
 */
export function parseSourcingModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (SOURCING_MODE_WIRE as readonly string[]).includes(v) ? v : null;
}

/** Analytics mode ranges (?range= — ephemeral URL filter, Monitor archetype). */
type SourcingAnalyticsRangeKey = '30d' | '90d' | '1y';
export const SOURCING_ANALYTICS_RANGES: { id: SourcingAnalyticsRangeKey; label: string }[] = [
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '1y', label: '1 year' },
];
export function parseSourcingAnalyticsRange(raw: string | null): SourcingAnalyticsRangeKey {
  return raw === '30d' || raw === '1y' ? raw : '90d';
}

/** Supplier type → short label (matches the suppliers table vocab). */
export const SUPPLIER_TYPE_LABEL: Record<string, string> = {
  ebay_seller: 'eBay seller',
  distributor: 'Distributor',
  salvage: 'Salvage',
  oem: 'OEM',
  marketplace: 'Marketplace',
  other: 'Other',
};

/**
 * The sidebar filter rows (`NAV_PAGE_DECLS.sourcing`, ex-`SourcingSidebarPanel`
 * pill sliders). Each list omits its param's default — Queue's `live`,
 * Watchlist's and Suppliers' `all` — because an absent param IS the default;
 * Scout's `by` has two values, so both are listed (`model` equals absent).
 */
export const SOURCING_ALERT_STATUS_OPTIONS = [
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
] as const;
export const SOURCING_WATCH_STATUS_OPTIONS = [
  { value: 'watching', label: 'Watching' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'imported', label: 'Imported' },
] as const;
export const SOURCING_SUPPLIER_TYPE_OPTIONS = [
  { value: 'ebay_seller', label: 'eBay' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'oem', label: 'OEM' },
] as const;
export const SOURCING_SCOUT_BY_OPTIONS = [
  { value: 'model', label: 'Model' },
  { value: 'serial', label: 'Serial' },
] as const;

/** Cadence label + tone for standing searches. */
export const CADENCE_LABEL: Record<string, string> = {
  off: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
};

export const cadenceTone: Record<string, string> = {
  daily: 'bg-emerald-50 text-emerald-700',
  weekly: 'bg-blue-50 text-blue-700',
  off: 'bg-surface-sunken text-text-soft',
};

export async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

export function formatCents(cents: number | null | undefined, currency = 'USD'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export const conditionTone: Record<string, string> = {
  new: 'bg-emerald-50 text-emerald-700',
  refurbished: 'bg-blue-50 text-blue-700',
  used: 'bg-amber-50 text-amber-700',
  for_parts: 'bg-red-50 text-red-700',
};

export const severityTone: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 ring-red-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  info: 'bg-surface-canvas text-text-muted ring-border-soft',
};

export const ALERT_TYPE_LABEL: Record<string, string> = {
  eol: 'End of life',
  discontinued: 'Discontinued',
  low_stock: 'Low stock',
  demand_no_stock: 'Demand · no stock',
  replenish: 'Replenish',
  missing_part: 'Missing part',
  repair_part: 'Repair part',
  warranty_part: 'Warranty part',
  fba_replenish: 'FBA replenish',
  manual: 'Manual',
};

/** Where a queue row's demand came from (chip on each Queue row). */
export const DEMAND_SOURCE_LABEL: Record<string, string> = {
  scan: 'Scan',
  replenish: 'Sold',
  missing_part: 'Missing part',
  repair: 'Repair',
  warranty: 'Warranty',
  order_exception: 'Order',
  pending_sku: 'Pending SKU',
  fba: 'FBA',
  manual: 'Manual',
};

export const demandSourceTone: Record<string, string> = {
  manual: 'bg-violet-50 text-violet-700',
  replenish: 'bg-indigo-50 text-indigo-700',
  repair: 'bg-orange-50 text-orange-700',
  warranty: 'bg-rose-50 text-rose-700',
  missing_part: 'bg-amber-50 text-amber-700',
  fba: 'bg-orange-50 text-orange-700',
  scan: 'bg-surface-sunken text-text-muted',
};
