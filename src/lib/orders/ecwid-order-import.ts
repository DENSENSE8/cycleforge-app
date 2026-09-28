import 'server-only';

/**
 * Ecwid order → sales-order prefill, the third arrival mode of the new order
 * form (beside typing one and importing a Square invoice). The operator finds
 * a storefront order by number, buyer or product; Enter fills customer,
 * ship-to, EVERY line (title, SKU, qty, unit price), tracking and the order
 * number, and the form moves on to Team.
 *
 * Mapping is the storefront sync's own (`mapEcwidOrdersToCanonicalLines`), so
 * an imported order and a synced one read identically. An order already in
 * CycleForge (same order number) is marked `importedAs` and never imports twice.
 */

import { resolveEcwidCreds, type EcwidCredentials } from '@/lib/ecwid/client';
import { mapEcwidOrdersToCanonicalLines } from '@/lib/orders/sources/ecwid-orders';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';
const DEFAULT_LIMIT = 12;
const MAX_QUERY_LENGTH = 160;
const REQUEST_TIMEOUT_MS = 8_000;

export interface EcwidOrderImportLine {
  title: string;
  sku: string;
  /** What the storefront sync writes as `orders.item_number` — the pairing key. */
  itemNumber: string;
  quantity: number;
  /** Price each, cents — the transacted line price over its units; null when Ecwid carries none. */
  unitCents: number | null;
}

export interface EcwidOrderImport {
  orderNumber: string;
  createdAt: string | null;
  currency: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
    shipTo: { address1: string; address2: string; city: string; state: string; postalCode: string; country: string };
  };
  /** A complete ship-to came with the order — without one it leaves over the counter. */
  hasShipTo: boolean;
  lines: EcwidOrderImportLine[];
  trackingNumbers: string[];
  buyerNote: string;
  totalCents: number | null;
  /** The CycleForge order number it already lives under, else null. */
  importedAs: string | null;
}

type Fetcher = typeof fetch;

interface Deps {
  fetcher?: Fetcher;
  resolveCredentials?: typeof resolveEcwidCreds;
  /** Order numbers of these that already exist in CycleForge. */
  existingOrderNumbers?: (orgId: OrgId, orderNumbers: string[]) => Promise<Set<string>>;
}

async function existingInCycleForge(orgId: OrgId, orderNumbers: string[]): Promise<Set<string>> {
  if (orderNumbers.length === 0) return new Set();
  const { rows } = await tenantQuery<{ order_id: string }>(
    orgId,
    'SELECT DISTINCT order_id FROM orders WHERE organization_id = $1 AND order_id = ANY($2::text[])',
    [orgId, orderNumbers],
  );
  return new Set(rows.map((r) => r.order_id));
}

async function ecwidJson(creds: EcwidCredentials, path: string, search: Record<string, string>, fetcher: Fetcher): Promise<unknown> {
  const url = new URL(`${ECWID_BASE_URL}/${encodeURIComponent(creds.storeId)}${path}`);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ecwid request failed (${response.status})`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

const cents = (decimal: string | null): number | null => {
  if (decimal == null) return null;
  const n = Math.round(Number(decimal) * 100);
  return Number.isFinite(n) ? n : null;
};

/** One order's canonical lines (all share `externalOrderId`) → the form's prefill. */
export function toEcwidOrderImport(lines: readonly CanonicalOrderLine[], importedAs: string | null): EcwidOrderImport {
  const first = lines[0]!;
  const ship = first.buyer?.shipTo ?? null;
  const shipTo = {
    address1: ship?.address1 ?? '',
    address2: ship?.address2 ?? '',
    city: ship?.city ?? '',
    state: ship?.state ?? '',
    postalCode: ship?.postalCode ?? '',
    country: ship?.country || 'US',
  };
  const out: EcwidOrderImportLine[] = lines.map((l) => {
    const quantity = Math.max(1, Number.parseInt(l.quantity, 10) || 1);
    const lineCents = cents(l.saleAmount);
    return {
      title: l.productTitle,
      sku: l.sku,
      itemNumber: l.itemNumber,
      quantity,
      unitCents: lineCents == null ? null : Math.round(lineCents / quantity),
    };
  });
  const lineTotals = lines.map((l) => cents(l.saleAmount));
  return {
    orderNumber: first.externalOrderId,
    createdAt: first.orderDate ? first.orderDate.toISOString() : null,
    currency: first.currency,
    customer: { name: first.buyer?.name ?? '', email: first.buyer?.email ?? '', phone: first.buyer?.phone ?? '', shipTo },
    hasShipTo: Boolean(shipTo.address1 && shipTo.city && shipTo.state && shipTo.postalCode),
    lines: out,
    trackingNumbers: [...new Set(lines.flatMap((l) => l.trackings))],
    buyerNote: first.notes,
    totalCents: lineTotals.every((c) => c != null) ? lineTotals.reduce<number>((sum, c) => sum + c!, 0) : null,
    importedAs,
  };
}

/** Storefront orders matching `query` (number, buyer, product words), newest first. */
export async function searchEcwidOrderImports(
  orgId: OrgId,
  input: { query: string; limit?: number },
  deps: Deps = {},
): Promise<{ connected: boolean; orders: EcwidOrderImport[] }> {
  const query = input.query.trim().slice(0, MAX_QUERY_LENGTH);
  const creds = await (deps.resolveCredentials ?? resolveEcwidCreds)(orgId);
  if (!creds) return { connected: false, orders: [] };
  if (query.length < 2) return { connected: true, orders: [] };
  const requested = Number(input.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 50) : DEFAULT_LIMIT;

  const body = (await ecwidJson(creds, '/orders', { keywords: query, limit: String(limit) }, deps.fetcher ?? fetch)) as
    | { items?: unknown[] }
    | unknown[];
  const raw = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
  const byOrder = new Map<string, CanonicalOrderLine[]>();
  for (const line of mapEcwidOrdersToCanonicalLines(raw)) {
    byOrder.set(line.externalOrderId, [...(byOrder.get(line.externalOrderId) ?? []), line]);
  }
  const numbers = [...byOrder.keys()];
  const existing = await (deps.existingOrderNumbers ?? existingInCycleForge)(orgId, numbers);
  return {
    connected: true,
    orders: numbers.slice(0, limit).map((n) => toEcwidOrderImport(byOrder.get(n)!, existing.has(n) ? n : null)),
  };
}
