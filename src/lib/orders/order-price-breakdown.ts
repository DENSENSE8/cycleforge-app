/** One order's money, broken down for the Selected-order column — `GET /api/orders/[id]/price-breakdown`. */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { LABEL_PURPOSES, type LabelCreationType, type LabelPurpose } from '@/lib/shipping/label-purpose';

/** One v1 line item as the connector persists it (`shipstation_order_refs.line_items`). */
interface PriceLineInput {
  sku?: string | null;
  name?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  adjustment?: boolean | null;
}

export interface PriceOrderInput {
  orderNumber: string | null;
  orderTotal: number | null;
  amountPaid: number | null;
  taxAmount: number | null;
  shippingAmount: number | null;
  lineItems: readonly PriceLineInput[];
}

export interface PriceLabelInput {
  id: number;
  purpose: LabelPurpose;
  creationType: LabelCreationType;
  status: string;
  trackingNumber: string | null;
  carrierCode: string | null;
  cost: number | null;
  insuranceCost: number | null;
}

export interface PriceBreakdownInput {
  /** The persisted ShipStation v1 order; null when the order never came through ShipStation. */
  shipstation: PriceOrderInput | null;
  /** The orders row's own sale amount — the only price a non-ShipStation order carries. */
  rowSaleAmount: number | null;
  labels: readonly PriceLabelInput[];
}

export interface PriceLine {
  sku: string | null;
  name: string | null;
  quantity: number;
  unitPrice: number | null;
  /** qty × unit price; null when the unit price is unknown. */
  total: number | null;
}

export interface PriceLabelLine {
  id: number;
  purpose: LabelPurpose;
  creationType: LabelCreationType;
  trackingNumber: string | null;
  carrierCode: string | null;
  cost: number | null;
  insuranceCost: number | null;
  /** cost + insurance; null when the cost is unknown. */
  total: number | null;
}

export interface PriceBreakdown {
  /** Where the order amounts came from. */
  source: 'shipstation' | 'order_row' | 'none';
  lines: PriceLine[];
  itemSubtotal: number | null;
  /** Sum of v1 adjustment lines (discounts / fees); null when there are none. */
  adjustments: number | null;
  shippingCharged: number | null;
  tax: number | null;
  orderTotal: number | null;
  amountPaid: number | null;
  /** The orders row's sale amount — shown only when there is no ShipStation order. */
  saleAmount: number | null;
  labels: PriceLabelLine[];
  /** Label cost per purpose; a purpose with no label is absent. */
  labelCostByPurpose: Partial<Record<LabelPurpose, number>>;
  labelCostTotal: number;
  /** paid − tax − label costs; null when neither paid nor total is known. */
  net: number | null;
  /** Which figure the net starts from. */
  netBasis: 'amount_paid' | 'order_total' | 'sale_amount' | null;
  /** A cost or tax the net could not include. */
  incomplete: boolean;
  gaps: string[];
}

/** Money → integer cents, or null for an unusable value. */
function cents(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function buildPriceBreakdown(input: PriceBreakdownInput): PriceBreakdown {
  const gaps: string[] = [];
  const ss = input.shipstation;

  // ── Items ────────────────────────────────────────────────────────────────
  const lines: PriceLine[] = [];
  const lineCents: number[] = [];
  const adjustmentCents: number[] = [];
  let unpricedLines = 0;
  for (const item of ss?.lineItems ?? []) {
    const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
    const unit = cents(item.unitPrice);
    // Round the unit to cents BEFORE multiplying, so qty multiplies a real price.
    const total = unit == null ? null : unit * quantity;
    if (item.adjustment) {
      if (total != null) adjustmentCents.push(total);
      continue;
    }
    if (total == null) unpricedLines += 1;
    else lineCents.push(total);
    lines.push({
      sku: item.sku?.trim() || null,
      name: item.name?.trim() || null,
      quantity,
      unitPrice: unit == null ? null : unit / 100,
      total: total == null ? null : total / 100,
    });
  }
  if (unpricedLines > 0) gaps.push(`${unpricedLines} item line${unpricedLines === 1 ? '' : 's'} without a unit price`);
  const itemSubtotalCents = lineCents.length > 0 ? sumCents(lineCents) : null;

  // ── Order amounts ────────────────────────────────────────────────────────
  const shippingCents = cents(ss?.shippingAmount);
  const taxCents = cents(ss?.taxAmount);
  const totalCents = cents(ss?.orderTotal);
  const paidCents = cents(ss?.amountPaid);
  const saleCents = cents(input.rowSaleAmount);

  // ── Labels (live only — a voided label was refunded, a pending one is unknown) ──
  const labels: PriceLabelLine[] = [];
  const byPurpose: Partial<Record<LabelPurpose, number>> = {};
  let unknownLabelCosts = 0;
  for (const label of input.labels) {
    if (label.status !== 'purchased') continue;
    const cost = cents(label.cost);
    const insurance = cents(label.insuranceCost) ?? 0;
    const total = cost == null ? null : cost + insurance;
    if (total == null) unknownLabelCosts += 1;
    else byPurpose[label.purpose] = (byPurpose[label.purpose] ?? 0) + total;
    labels.push({
      id: label.id,
      purpose: label.purpose,
      creationType: label.creationType,
      trackingNumber: label.trackingNumber,
      carrierCode: label.carrierCode,
      cost: cost == null ? null : cost / 100,
      insuranceCost: cents(label.insuranceCost) == null ? null : insurance / 100,
      total: total == null ? null : total / 100,
    });
  }
  if (unknownLabelCosts > 0) {
    gaps.push(`${unknownLabelCosts} label${unknownLabelCosts === 1 ? '' : 's'} with no known cost`);
  }
  const labelCostCents = sumCents(Object.values(byPurpose) as number[]);
  const labelCostByPurpose: Partial<Record<LabelPurpose, number>> = {};
  for (const purpose of LABEL_PURPOSES) {
    const value = byPurpose[purpose];
    if (value != null) labelCostByPurpose[purpose] = value / 100;
  }

  // ── Net ──────────────────────────────────────────────────────────────────
  const source: PriceBreakdown['source'] = ss ? 'shipstation' : saleCents != null ? 'order_row' : 'none';
  let basisCents: number | null = null;
  let netBasis: PriceBreakdown['netBasis'] = null;
  if (paidCents != null) {
    basisCents = paidCents;
    netBasis = 'amount_paid';
  } else if (totalCents != null) {
    basisCents = totalCents;
    netBasis = 'order_total';
    gaps.push('amount paid unknown — net starts from the order total');
  } else if (!ss && saleCents != null) {
    basisCents = saleCents;
    netBasis = 'sale_amount';
    gaps.push('not a ShipStation order — net starts from the sale amount');
  } else {
    gaps.push('no order amount to start the net from');
  }
  if (basisCents != null && taxCents == null && ss) gaps.push('tax unknown — not deducted');
  const net = basisCents == null ? null : (basisCents - (taxCents ?? 0) - labelCostCents) / 100;

  return {
    source,
    lines,
    itemSubtotal: itemSubtotalCents == null ? null : itemSubtotalCents / 100,
    adjustments: adjustmentCents.length > 0 ? sumCents(adjustmentCents) / 100 : null,
    shippingCharged: shippingCents == null ? null : shippingCents / 100,
    tax: taxCents == null ? null : taxCents / 100,
    orderTotal: totalCents == null ? null : totalCents / 100,
    amountPaid: paidCents == null ? null : paidCents / 100,
    saleAmount: ss || saleCents == null ? null : saleCents / 100,
    labels,
    labelCostByPurpose,
    labelCostTotal: labelCostCents / 100,
    net,
    netBasis,
    incomplete: unknownLabelCosts > 0 || (basisCents != null && taxCents == null && ss != null),
    gaps,
  };
}

// ─── Read (persisted rows only) ─────────────────────────────────────────────

type OrderMoneyRow = {
  sale_amount: string | number | null;
  ss_order_number: string | null;
  order_total: string | number | null;
  amount_paid: string | number | null;
  tax_amount: string | number | null;
  shipping_amount: string | number | null;
  line_items: unknown;
};

type LabelMoneyRow = {
  id: string | number;
  purpose: LabelPurpose;
  creation_type: LabelCreationType;
  status: string;
  tracking_number: string | null;
  carrier_code: string | null;
  cost: string | number | null;
  insurance_cost: string | number | null;
};

export interface OrderPriceBreakdownDeps {
  /** The order row + its ShipStation order amounts; null when not in this org. */
  readOrder(orgId: OrgId, orderId: number): Promise<OrderMoneyRow | null>;
  /** Labels on the order row or any sibling row of the same ShipStation order. */
  readLabels(orgId: OrgId, orderId: number): Promise<LabelMoneyRow[]>;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function lineItemsFrom(raw: unknown): PriceLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => it != null && typeof it === 'object')
    .map((it) => ({
      sku: typeof it.sku === 'string' ? it.sku : null,
      name: typeof it.name === 'string' ? it.name : null,
      quantity: num(it.quantity as string | number | null),
      unitPrice: num(it.unitPrice as string | number | null),
      adjustment: it.adjustment === true,
    }));
}

const ORDER_MONEY_SQL = `
  SELECT o.sale_amount,
         r.order_number AS ss_order_number,
         r.order_total, r.amount_paid, r.tax_amount, r.shipping_amount, r.line_items
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT sr.order_number, sr.order_total, sr.amount_paid, sr.tax_amount, sr.shipping_amount, sr.line_items
        FROM shipstation_order_refs sr
       WHERE sr.organization_id = o.organization_id AND sr.order_row_id = o.id
       ORDER BY sr.last_seen_at DESC, sr.id DESC
       LIMIT 1
    ) r ON TRUE
   WHERE o.id = $1 AND o.organization_id = $2
   LIMIT 1`;

// The order's rows = this row + every row the same ShipStation order enriched.
const LABEL_MONEY_SQL = `
  WITH rows AS (
    SELECT $1::int AS order_row_id
    UNION
    SELECT sib.order_row_id
      FROM shipstation_order_refs mine
      JOIN shipstation_order_refs sib
        ON sib.organization_id = mine.organization_id
       AND sib.shipstation_order_id = mine.shipstation_order_id
     WHERE mine.organization_id = $2 AND mine.order_row_id = $1
  )
  -- Cost and insurance come from ONE source: a ledger cost (v2: shipment +
  -- insurance already summed) never picks up the v1 row's insurance on top.
  SELECT lp.id, lp.purpose, lp.creation_type, lp.status, lp.tracking_number, lp.carrier_code,
         COALESCE(lp.cost, ssr.shipment_cost) AS cost,
         CASE WHEN lp.cost IS NULL THEN ssr.insurance_cost ELSE lp.insurance_cost END AS insurance_cost
    FROM shipping_label_purchases lp
    LEFT JOIN shipstation_shipment_refs ssr
      ON ssr.organization_id = lp.organization_id
     AND ssr.shipstation_shipment_id = lp.shipstation_shipment_id
   WHERE lp.organization_id = $2
     AND lp.order_id IN (SELECT order_row_id FROM rows)
     AND lp.status IN ('purchased', 'voided')
   ORDER BY lp.created_at ASC, lp.id ASC`;

const defaultOrderPriceBreakdownDeps: OrderPriceBreakdownDeps = {
  readOrder: async (orgId, orderId) => {
    const res = await tenantQuery<OrderMoneyRow>(orgId, ORDER_MONEY_SQL, [orderId, orgId]);
    return res.rows[0] ?? null;
  },
  readLabels: async (orgId, orderId) => {
    const res = await tenantQuery<LabelMoneyRow>(orgId, LABEL_MONEY_SQL, [orderId, orgId]);
    return res.rows;
  },
};

/** The order's price breakdown; null when the order is not in this org. */
export async function getOrderPriceBreakdown(
  orgId: OrgId,
  orderId: number,
  deps: OrderPriceBreakdownDeps = defaultOrderPriceBreakdownDeps,
): Promise<(PriceBreakdown & { orderId: number; shipstationOrderNumber: string | null }) | null> {
  // Both reads are persisted, tenant-scoped, and independent. Keeping them in
  // one network flight removes a full Neon round trip from the detail panel.
  const [order, labels] = await Promise.all([
    deps.readOrder(orgId, orderId),
    deps.readLabels(orgId, orderId),
  ]);
  if (!order) return null;
  const hasShipStation =
    order.ss_order_number != null ||
    order.order_total != null ||
    order.amount_paid != null ||
    order.line_items != null;
  const breakdown = buildPriceBreakdown({
    shipstation: hasShipStation
      ? {
          orderNumber: order.ss_order_number,
          orderTotal: num(order.order_total),
          amountPaid: num(order.amount_paid),
          taxAmount: num(order.tax_amount),
          shippingAmount: num(order.shipping_amount),
          lineItems: lineItemsFrom(order.line_items),
        }
      : null,
    rowSaleAmount: num(order.sale_amount),
    labels: labels.map((l) => ({
      id: Number(l.id),
      purpose: l.purpose,
      creationType: l.creation_type,
      status: l.status,
      trackingNumber: l.tracking_number,
      carrierCode: l.carrier_code,
      cost: num(l.cost),
      insuranceCost: num(l.insurance_cost),
    })),
  });
  return { orderId, shipstationOrderNumber: order.ss_order_number, ...breakdown };
}
