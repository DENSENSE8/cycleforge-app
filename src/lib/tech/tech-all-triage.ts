/**
 * Tech All triage — merge adapter + urgency sort for `/test` and `/unbox` All tabs.
 * Composes existing feeds; does not invent a second search engine.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { PickupLine } from '@/components/receiving/pickup/pickup-lines';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { ShippedOrder } from '@/types/orders';
import {
  TECH_ALL_TRIAGE_TYPE_LABEL,
  type TechAllTriageType,
} from '@/lib/tech/tech-all-triage-type';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

export type TechAllTriageScope = 'testing' | 'shipping' | 'unbox';

export interface TechAllTriageRow {
  /** Stable list key — `${type}:${entityId}`. */
  id: string;
  type: TechAllTriageType;
  typeLabel: string;
  /** Primary identity line (title / product / order #). */
  title: string;
  /** Quiet second line (SKU · customer · tracking). */
  subtitle: string;
  stage: string;
  /** Lower = do first. */
  urgencyRank: number;
  /** ISO / parseable stamp for secondary sort (newest first within rank). */
  sortAt: string | null;
  /** Open dispatcher payload. */
  ref:
    | { kind: 'receiving_line'; row: ReceivingLineRow }
    | { kind: 'order'; order: ShippedOrder }
    | { kind: 'repair'; repairId: number }
    | { kind: 'pickup'; orderId: number };
}

function ageHours(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, (Date.now() - ms) / 3_600_000);
}

function receivingType(row: ReceivingLineRow): TechAllTriageType {
  const intake = String(
    row.intake_type || row.receiving_type || row.carton_intake_type || '',
  )
    .trim()
    .toLowerCase();
  const isReturn =
    intake === 'return' ||
    Boolean((row as { is_return?: boolean | null }).is_return);
  if (isReturn) return 'return';
  return 'purchase_order';
}

function receivingTitle(row: ReceivingLineRow): string {
  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts): Zoho item title governs.
  const identity = resolveSkuIdentityTitle({
    zoho_item_title: row.zoho_item_title,
    catalog_product_title: row.catalog_product_title,
    item_name: row.item_name,
    sku: row.sku,
  });
  return (identity || row.zoho_purchaseorder_number || `Line #${row.id}`).trim();
}

function receivingUrgency(row: ReceivingLineRow): number {
  if (row.is_priority) return 0;
  const tier = row.priority_tier;
  if (tier != null && Number.isFinite(tier)) return Math.max(0, Number(tier));
  const age = ageHours(row.received_at || row.unboxed_at || row.created_at);
  if (age >= 48) return 2;
  if (age >= 24) return 3;
  return 5;
}

function triageRowFromReceivingLine(row: ReceivingLineRow): TechAllTriageRow {
  const type = receivingType(row);
  const po = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  const sku = (row.sku || '').trim();
  const tracking = (row.tracking_number || '').trim();
  return {
    id: `receiving_line:${row.id}`,
    type,
    typeLabel: TECH_ALL_TRIAGE_TYPE_LABEL[type],
    title: receivingTitle(row),
    subtitle: [po && `PO ${po}`, sku && `SKU ${sku}`, tracking && `TRK ${tracking}`]
      .filter(Boolean)
      .join(' · '),
    stage: String(row.workflow_status || 'Needs test').replace(/_/g, ' '),
    urgencyRank: receivingUrgency(row),
    sortAt: row.received_at || row.unboxed_at || row.created_at || null,
    ref: { kind: 'receiving_line', row },
  };
}

export function triageRowFromOrder(order: ShippedOrder): TechAllTriageRow {
  const urgent = Boolean((order as { is_urgent?: boolean }).is_urgent);
  const shipBy = order.ship_by_date || order.deadline_at || null;
  let urgencyRank = urgent ? 0 : 4;
  if (!urgent && shipBy) {
    const shipMs = Date.parse(shipBy);
    if (Number.isFinite(shipMs)) {
      const hoursLeft = (shipMs - Date.now()) / 3_600_000;
      if (hoursLeft < 0) urgencyRank = 1;
      else if (hoursLeft < 24) urgencyRank = 2;
      else if (hoursLeft < 48) urgencyRank = 3;
    }
  }
  const tracking = (order.shipping_tracking_number || '').trim();
  return {
    id: `order:${order.id}`,
    type: 'order',
    typeLabel: TECH_ALL_TRIAGE_TYPE_LABEL.order,
    title: (order.order_id || order.product_title || `Order #${order.id}`).trim(),
    subtitle: [order.sku && `SKU ${order.sku}`, tracking && `TRK ${tracking}`]
      .filter(Boolean)
      .join(' · '),
    stage: urgent ? 'Urgent' : 'To ship',
    urgencyRank,
    sortAt: order.test_date_time || order.packed_at || shipBy,
    ref: { kind: 'order', order },
  };
}

export function triageRowFromRepair(repair: RSRecord): TechAllTriageRow {
  const age = ageHours(repair.created_at);
  const urgencyRank = age >= 72 ? 1 : age >= 24 ? 2 : 4;
  return {
    id: `repair:${repair.id}`,
    type: 'repair',
    typeLabel: TECH_ALL_TRIAGE_TYPE_LABEL.repair,
    title: (repair.product_title || repair.ticket_number || `RS #${repair.id}`).trim(),
    subtitle: [repair.ticket_number, repair.customer_name || repair.contact_info]
      .filter(Boolean)
      .join(' · '),
    stage: repair.status || 'Active',
    urgencyRank,
    sortAt: repair.updated_at || repair.created_at || null,
    ref: { kind: 'repair', repairId: repair.id },
  };
}

/** One triage row per LCPU order (fold lines). */
function triageRowFromPickupOrder(lines: PickupLine[]): TechAllTriageRow | null {
  const first = lines[0];
  if (!first) return null;
  const age = ageHours(first.pickup_date);
  const urgencyRank = age >= 48 ? 1 : age >= 24 ? 2 : 4;
  const customer = (first.customer_name || '').trim();
  const po = (first.po_number || first.reference_number || '').trim();
  return {
    id: `pickup:${first.order_id}`,
    type: 'pickup',
    typeLabel: TECH_ALL_TRIAGE_TYPE_LABEL.pickup,
    title: po ? `Pickup ${po}` : `Pickup #${first.order_id}`,
    subtitle: [customer, `${lines.length} line${lines.length === 1 ? '' : 's'}`]
      .filter(Boolean)
      .join(' · '),
    stage: first.order_status || 'Open',
    urgencyRank,
    sortAt: first.pickup_date || null,
    ref: { kind: 'pickup', orderId: first.order_id },
  };
}

export function compareTechAllTriageRows(a: TechAllTriageRow, b: TechAllTriageRow): number {
  if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
  const aMs = a.sortAt ? Date.parse(a.sortAt) : 0;
  const bMs = b.sortAt ? Date.parse(b.sortAt) : 0;
  return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
}

export function mergeTechAllTriageRows(parts: {
  scope: TechAllTriageScope;
  receivingLines?: ReceivingLineRow[];
  orders?: ShippedOrder[];
  repairs?: RSRecord[];
  pickupLines?: PickupLine[];
  search?: string;
}): TechAllTriageRow[] {
  const rows: TechAllTriageRow[] = [];
  const q = (parts.search || '').trim().toLowerCase();

  // Receiving lines: Testing (needs-test) + Unbox (scanned queue). Never Shipping.
  if (parts.scope === 'testing' || parts.scope === 'unbox') {
    for (const line of parts.receivingLines ?? []) {
      rows.push(triageRowFromReceivingLine(line));
    }
  }

  // Repair + pickup: every All scope (typed deep-links; stations stay home).
  for (const repair of parts.repairs ?? []) {
    rows.push(triageRowFromRepair(repair));
  }
  const byOrder = new Map<number, PickupLine[]>();
  for (const line of parts.pickupLines ?? []) {
    if (line.order_status === 'COMPLETED') continue;
    const list = byOrder.get(line.order_id) ?? [];
    list.push(line);
    byOrder.set(line.order_id, list);
  }
  for (const group of byOrder.values()) {
    const row = triageRowFromPickupOrder(group);
    if (row) rows.push(row);
  }

  // Orders: Shipping All = all to-ship; Testing All = urgent-only; Unbox = none.
  if (parts.scope === 'shipping') {
    for (const order of parts.orders ?? []) {
      rows.push(triageRowFromOrder(order));
    }
  } else if (parts.scope === 'testing') {
    for (const order of parts.orders ?? []) {
      const urgent = Boolean((order as { is_urgent?: boolean }).is_urgent);
      if (urgent) rows.push(triageRowFromOrder(order));
    }
  }

  const filtered = q
    ? rows.filter((r) => {
        const hay = `${r.typeLabel} ${r.title} ${r.subtitle} ${r.stage}`.toLowerCase();
        return hay.includes(q);
      })
    : rows;

  return filtered.sort(compareTechAllTriageRows);
}
