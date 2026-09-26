/** Front-desk transaction feed — the presentation SoT for the Sales Monitor (`/walk-in`). */

import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { formatCentsToDollars } from '@/lib/square/client';
import { toPSTDateKey } from '@/utils/date';
import type { WalkInHistoryCategory } from './history-categories';

/** The three front-desk spines that make up a transaction. */
export type TransactionKind = 'sale' | 'pickup' | 'repair';

/** One resolved row of the Sales feed — every field is display-ready. */
export interface WalkInTransaction {
  /** Stable React key — kind-scoped, since ids only collide across spines. */
  key: string;
  kind: TransactionKind;
  /** Instant that orders the feed (newest first). */
  at: string;
  /** Warehouse civil day (`YYYY-MM-DD`) — the day-band key. */
  dateKey: string;
  /** Row title: who the transaction is with. */
  customer: string;
  /** Row meta: what it was. */
  detail: string;
  /** Pre-formatted money — each spine stores a different unit, so normalize here. */
  amountLabel: string;
  /** Raw dollars, for the rollup only (never render this — use `amountLabel`). */
  amount: number;
  status: string;
}

/** Domain rows as the walk-in sales API returns them. */
export interface SaleRow {
  id: string;
  customer_name: string | null;
  /** Square money: CENTS. */
  total: number | null;
  status: string;
  order_source: string;
  created_at: string;
  line_items: Array<{ name: string; quantity: string }>;
}

/** Domain rows as the local-pickup API returns them. */
export interface PickupOrderRow {
  id: number;
  pickup_date: string;
  customer_name: string | null;
  status: string;
  item_count: number;
  /** DOLLARS, as a numeric string. */
  total_value: string;
  completed_at: string | null;
  created_at: string;
}

/** Which category tab a kind belongs to (`all` holds every kind). */
const KIND_CATEGORY: Record<TransactionKind, WalkInHistoryCategory> = {
  sale: 'sales',
  pickup: 'pickups',
  repair: 'repairs',
};

/** Money is only ever formatted here — cents vs dollars is a per-spine detail. */
function formatDollars(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function saleToTransaction(row: SaleRow): WalkInTransaction {
  const items = row.line_items
    ?.slice(0, 2)
    .map((li) => `${li.quantity}× ${li.name}`)
    .join(', ');
  const more = (row.line_items?.length ?? 0) > 2 ? ` +${row.line_items.length - 2}` : '';
  const cents = row.total ?? 0;
  return {
    key: `sale-${row.id}`,
    kind: 'sale',
    at: row.created_at,
    dateKey: toPSTDateKey(row.created_at) ?? '',
    customer: firstNonEmpty(row.customer_name) ?? 'Walk-in',
    detail: items ? `${items}${more}` : 'Sale',
    amountLabel: row.total != null ? formatCentsToDollars(row.total) : '—',
    amount: cents / 100,
    status: row.status,
  };
}

export function pickupToTransaction(row: PickupOrderRow): WalkInTransaction {
  // `completed_at` is the transaction moment; `created_at` is the fallback for a
  // row that reached this feed without a completion stamp.
  const at = row.completed_at ?? row.created_at;
  const amount = Number(row.total_value) || 0;
  return {
    key: `pickup-${row.id}`,
    kind: 'pickup',
    at,
    dateKey: toPSTDateKey(at) ?? '',
    customer: firstNonEmpty(row.customer_name) ?? 'Seller',
    detail: `${row.item_count} item${row.item_count === 1 ? '' : 's'}`,
    amountLabel: formatDollars(amount),
    amount,
    status: row.status,
  };
}

export function repairToTransaction(row: RSRecord): WalkInTransaction {
  // A done repair's `updated_at` is when it was picked up — the moment that
  // belongs on a transaction history; `created_at` is only intake.
  const at = row.updated_at || row.created_at;
  const amount = Number(row.price) || 0;
  return {
    key: `repair-${row.id}`,
    kind: 'repair',
    at,
    dateKey: toPSTDateKey(at) ?? '',
    customer: firstNonEmpty(row.customer_name, row.contact_info) ?? 'Customer',
    detail: firstNonEmpty(row.product_title) ?? 'Repair',
    amountLabel: formatDollars(amount),
    amount,
    status: row.status,
  };
}

/** Undated rows sort last rather than throwing off the merge. */
function order(at: string): number {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Merge every spine into one newest-first feed. Callers pass whatever resolved —
 * a spine that failed simply contributes nothing, so the feed degrades instead
 * of emptying (Workbench/Monitor degrade-not-fail).
 */
export function mergeTransactions(...spines: WalkInTransaction[][]): WalkInTransaction[] {
  return spines.flat().sort((a, b) => order(b.at) - order(a.at));
}

/** `all` keeps every kind; a category tab narrows the same merged feed. */
export function filterTransactions(
  rows: WalkInTransaction[],
  category: WalkInHistoryCategory,
): WalkInTransaction[] {
  if (category === 'all') return rows;
  return rows.filter((row) => KIND_CATEGORY[row.kind] === category);
}

/** Per-tab counts for the chrome tabs — one pass, every category. */
export function countTransactions(
  rows: WalkInTransaction[],
): Record<WalkInHistoryCategory, number> {
  const counts: Record<WalkInHistoryCategory, number> = {
    all: rows.length,
    sales: 0,
    pickups: 0,
    repairs: 0,
  };
  for (const row of rows) counts[KIND_CATEGORY[row.kind]] += 1;
  return counts;
}

interface TransactionRollup {
  /** Transactions in the current view. */
  count: number;
  /** Gross dollars across the current view. */
  gross: string;
  /** Average transaction value across the current view. */
  average: string;
  /** Transactions on the most recent warehouse day present in the view. */
  latestDayCount: number;
  /** The civil day `latestDayCount` describes (`null` when the view is empty). */
  latestDayKey: string | null;
}

/**
 * The Monitor rollup for whatever the feed currently shows. Derived from the
 * SAME rows the list renders, so the KPI hero can never disagree with the table
 * under it (the "chrome never invents a second story" law).
 */
export function summarizeTransactions(rows: WalkInTransaction[]): TransactionRollup {
  const gross = rows.reduce((sum, row) => sum + row.amount, 0);
  const latestDayKey = rows.find((row) => row.dateKey)?.dateKey ?? null;
  return {
    count: rows.length,
    gross: formatDollars(gross),
    average: formatDollars(rows.length ? gross / rows.length : 0),
    latestDayCount: latestDayKey
      ? rows.filter((row) => row.dateKey === latestDayKey).length
      : 0,
    latestDayKey,
  };
}
