/** Paperwork pairing — which `product_manuals` rows (manuals, packing lists, PL + M, any insert) an order resolves, and under which source. */

import { normalizeIdentifier } from '@/lib/manuals/identifier-key';

export type PaperworkSource = 'order' | 'item_number' | 'sku';

/** Most specific first. */
const PAPERWORK_SOURCE_PRECEDENCE: readonly PaperworkSource[] = ['order', 'item_number', 'sku'];

/** Where a paperwork row is pinned today. */
export interface PaperworkPairing {
  orderId: number | null;
  itemNumber: string | null;
  sku: string | null;
  skuCatalogId: number | null;
}

/** The keys one order resolves paperwork by. */
export interface OrderPaperworkKeys {
  orderId: number;
  /** normalizeIdentifier(order item number) — '' when absent. */
  itemKey: string;
  /** paperworkSkuKey(order sku) — '' when absent. */
  skuKey: string;
  skuCatalogId: number | null;
}

/** What a write pins a row to: item number as its key, SKU trimmed. */
export interface PaperworkPairingTarget {
  orderId: number | null;
  itemNumber: string | null;
  sku: string | null;
}

export type PaperworkPairScope = PaperworkSource;

export class PaperworkPairingError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'PaperworkPairingError';
  }
}

const ITEM_NUMBER_MAX = 64;
const SKU_MAX = 100;

/** UPPER alnum (zeros kept: SKU 01103 ≠ 1103). */
export function paperworkSkuKey(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Every source a row matches for the order, most specific first. */
export function paperworkSources(pairing: PaperworkPairing, keys: OrderPaperworkKeys): PaperworkSource[] {
  const sources: PaperworkSource[] = [];
  if (pairing.orderId != null && pairing.orderId === keys.orderId) sources.push('order');
  if (keys.itemKey && normalizeIdentifier(pairing.itemNumber ?? '') === keys.itemKey) sources.push('item_number');
  const byCatalog =
    keys.skuCatalogId != null && pairing.skuCatalogId != null && pairing.skuCatalogId === keys.skuCatalogId;
  const bySku = Boolean(keys.skuKey) && paperworkSkuKey(pairing.sku) === keys.skuKey;
  if (byCatalog || bySku) sources.push('sku');
  return sources;
}

/** Precedence (unresolved last), then newest first, then id — the list and pack-print order. */
export function comparePaperwork(
  a: { source: PaperworkSource | null; updatedAt: string; id: number },
  b: { source: PaperworkSource | null; updatedAt: string; id: number },
): number {
  const rankOf = (source: PaperworkSource | null) =>
    source ? PAPERWORK_SOURCE_PRECEDENCE.indexOf(source) : PAPERWORK_SOURCE_PRECEDENCE.length;
  const rank = rankOf(a.source) - rankOf(b.source);
  if (rank !== 0) return rank;
  const at = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  if (Number.isFinite(at) && at !== 0) return at;
  return b.id - a.id;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new PaperworkPairingError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new PaperworkPairingError(`${field} is longer than ${max} characters`);
  return trimmed || null;
}

/** Validate a re-pair body `{ orderId?, itemNumber?, sku? */
export function parsePaperworkPairing(input: unknown): PaperworkPairingTarget {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PaperworkPairingError('pairing must be an object');
  }
  const body = input as Record<string, unknown>;

  let orderId: number | null = null;
  if (body.orderId !== undefined && body.orderId !== null) {
    const n = Number(body.orderId);
    if (!Number.isInteger(n) || n <= 0) throw new PaperworkPairingError('orderId must be a positive integer');
    orderId = n;
  }

  const itemRaw = optionalText(body.itemNumber, 'itemNumber', ITEM_NUMBER_MAX);
  const itemNumber = itemRaw ? normalizeIdentifier(itemRaw) : null;
  if (itemRaw && !itemNumber) throw new PaperworkPairingError('Item number needs a letter or digit');

  const sku = optionalText(body.sku, 'sku', SKU_MAX);
  if (sku && !paperworkSkuKey(sku)) throw new PaperworkPairingError('SKU needs a letter or digit');

  if (orderId == null && !itemNumber && !sku) {
    throw new PaperworkPairingError('Pair it to an order, an item number or a SKU — or unpair it');
  }
  return { orderId, itemNumber, sku };
}

/** `pairTo` from a form / body; absent → null (the caller defaults). */
export function parsePairScope(raw: unknown): PaperworkPairScope | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw === 'order' || raw === 'item_number' || raw === 'sku') return raw;
  throw new PaperworkPairingError('pairTo must be order, item_number or sku');
}

/**
 * SKU first (operator ruling 2026-10-05: pair at the true scope — one pair
 * fixes every open order of the SKU), else item number, else the order itself.
 * `sku` is the governing SKU: the catalog row's SKU when the line resolves to
 * one (`loadOrderContext`), so a line with a catalog id always defaults to SKU,
 * and `catalogIdForSku` pins that catalog id on the write.
 */
export function defaultPairScope(order: { itemNumber: string | null; sku: string | null }): PaperworkPairScope {
  if (paperworkSkuKey(order.sku)) return 'sku';
  if (normalizeIdentifier(order.itemNumber ?? '')) return 'item_number';
  return 'order';
}

/** The single key a scoped pair from an order pins. */
export function scopePairing(
  scope: PaperworkPairScope,
  order: { orderId: number; itemNumber: string | null; sku: string | null },
): PaperworkPairingTarget {
  if (scope === 'order') return { orderId: order.orderId, itemNumber: null, sku: null };
  if (scope === 'item_number') {
    const itemNumber = normalizeIdentifier(order.itemNumber ?? '');
    if (!itemNumber) throw new PaperworkPairingError('This order has no item number to pair to');
    return { orderId: null, itemNumber, sku: null };
  }
  const sku = order.sku?.trim() || '';
  if (!paperworkSkuKey(sku)) throw new PaperworkPairingError('This order has no SKU to pair to');
  return { orderId: null, itemNumber: null, sku };
}

/**
 * Pairing an existing library row from an order ADDS the scoped key and keeps
 * the row's other keys (a manual already on SKU X also lands on this item).
 * One column per key, so a new item number / SKU / order replaces the old one.
 */
export function mergePairing(
  existing: Pick<PaperworkPairingTarget, 'orderId' | 'itemNumber' | 'sku'>,
  added: PaperworkPairingTarget,
): PaperworkPairingTarget {
  return {
    orderId: added.orderId ?? existing.orderId,
    itemNumber: added.itemNumber ?? (existing.itemNumber ? normalizeIdentifier(existing.itemNumber) || null : null),
    sku: added.sku ?? (existing.sku?.trim() || null),
  };
}
