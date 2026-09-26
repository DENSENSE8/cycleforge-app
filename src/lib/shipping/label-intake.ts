/** Label intake — the global `+` flow: */

import 'server-only';
import { ApiError } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { createOrderNote } from '@/lib/orders/order-notes';
import { resolveShipFrom, getShipStationV2 } from '@/lib/shipping/shipstation/config';
import { resolveOrderShipTo } from '@/lib/shipping/shipstation/order-ship-to';
import { buildOrderShipmentSpec } from '@/lib/shipping/shipstation/order-shipment-spec';
import { listOrderLabels, labelTrailNote } from '@/lib/shipping/order-label-links';
import { purchaseLabelOnce, attachLabelPurchaseFacts, type PurchaseOnceOutcome } from '@/lib/shipping/label-purchase-ledger';
import type { LabelCreationType, LabelLedgerStatus, LabelPurpose } from '@/lib/shipping/label-purpose';
import type { Parcel, RateQuoteResult, ShipAddress, ShipmentSpec } from '@/lib/shipping/shipstation/types';

/** The purposes the intake buys — outbound labels belong to the To-ship run. */
type IntakePurpose = Extract<LabelPurpose, 'return' | 'replacement'>;

interface LabelIntakeOrder {
  id: number;
  orderRef: string;
  title: string | null;
  sku: string | null;
  quantity: number | null;
  platform: string | null;
  customerName: string | null;
}

interface LabelIntakeParcel {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

interface LabelIntakeLabel {
  id: number;
  purpose: LabelPurpose;
  status: LabelLedgerStatus;
  creationType: LabelCreationType;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  at: string | null;
  actorName: string | null;
  /** `false` = a reference-only row not yet attached to an order. */
  paired: boolean;
  printable: boolean;
}

interface LabelIntakeLookup {
  ref: string;
  order: LabelIntakeOrder | null;
  shipTo: ShipAddress | null;
  parcel: LabelIntakeParcel | null;
  labels: LabelIntakeLabel[];
  /** Reference-only rows under this number that an order could adopt. */
  unpairedCount: number;
}

type OrderRow = {
  id: number;
  order_id: string | null;
  account_source: string | null;
  customer_id: number | null;
  product_title: string | null;
  sku: string | null;
  quantity: string | null;
  customer_name: string | null;
};

type ReferenceRow = {
  id: string | number;
  purpose: LabelPurpose;
  status: LabelLedgerStatus;
  creation_type: LabelCreationType;
  tracking_number: string | null;
  carrier_code: string | null;
  service_code: string | null;
  cost: string | number | null;
  currency: string | null;
  label_id: string | null;
  created_at: Date | string;
  actor_name: string | null;
};

const OUNCES: Record<Parcel['weight']['unit'], number> = { ounce: 1, pound: 16, gram: 0.035274, kilogram: 35.274 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The engine parcel → the intake's ounces / inches vocabulary. */
function intakeParcelFrom(parcel: Parcel): LabelIntakeParcel {
  const toIn = parcel.dimensions?.unit === 'centimeter' ? 1 / 2.54 : 1;
  return {
    weightOz: round1(parcel.weight.value * OUNCES[parcel.weight.unit]),
    lengthIn: parcel.dimensions ? round1(parcel.dimensions.length * toIn) : null,
    widthIn: parcel.dimensions ? round1(parcel.dimensions.width * toIn) : null,
    heightIn: parcel.dimensions ? round1(parcel.dimensions.height * toIn) : null,
  };
}

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function findOrderByRef(orgId: OrgId, ref: string): Promise<OrderRow | null> {
  const res = await tenantQuery<OrderRow>(
    orgId,
    `SELECT o.id, o.order_id, o.account_source, o.customer_id, o.product_title, o.sku, o.quantity,
            NULLIF(COALESCE(c.display_name, c.customer_name), '') AS customer_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
      WHERE o.organization_id = $1 AND o.order_id = $2
      ORDER BY o.id ASC
      LIMIT 1`,
    [orgId, ref],
  );
  return res.rows[0] ?? null;
}

async function listReferenceLabels(orgId: OrgId, ref: string): Promise<LabelIntakeLabel[]> {
  const res = await tenantQuery<ReferenceRow>(
    orgId,
    `SELECT lp.id, lp.purpose, lp.status, lp.creation_type, lp.tracking_number, lp.carrier_code,
            lp.service_code, lp.cost, lp.currency, lp.label_id, lp.created_at, s.name AS actor_name
       FROM shipping_label_purchases lp
       LEFT JOIN staff s ON s.id = lp.purchased_by
      WHERE lp.organization_id = $1 AND lp.order_id IS NULL AND lp.order_ref = $2
        AND lp.status IN ('purchased', 'voided')
      ORDER BY lp.created_at ASC, lp.id ASC`,
    [orgId, ref],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    purpose: r.purpose,
    status: r.status,
    creationType: r.creation_type,
    trackingNumber: r.tracking_number,
    carrierCode: r.carrier_code,
    serviceCode: r.service_code,
    cost: num(r.cost),
    currency: r.currency,
    at: new Date(r.created_at).toISOString(),
    actorName: r.actor_name,
    paired: false,
    printable: r.status === 'purchased' && r.label_id != null,
  }));
}

/** Everything the intake shows for one typed order number. */
export async function lookupLabelIntake(orgId: OrgId, rawRef: string): Promise<LabelIntakeLookup> {
  const ref = rawRef.trim();
  const [orderRow, referenceLabels] = await Promise.all([findOrderByRef(orgId, ref), listReferenceLabels(orgId, ref)]);
  if (!orderRow) {
    return { ref, order: null, shipTo: null, parcel: null, labels: referenceLabels, unpairedCount: referenceLabels.length };
  }

  let shipTo: ShipAddress | null = null;
  let parcel: LabelIntakeParcel | null = null;
  try {
    const built = await buildOrderShipmentSpec(orgId, { orderId: orderRow.id, purpose: 'replacement' });
    shipTo = built.buyerAddress;
    parcel = intakeParcelFrom(built.parcel);
  } catch {
    // No parcel weight (or no ship-from) — the address still shows; the
    // operator types the weight inline.
    shipTo = (await resolveOrderShipTo(orgId, orderRow)).shipTo;
  }

  const orderLabels = await listOrderLabels(orgId, orderRow.id);
  const labels: LabelIntakeLabel[] = [
    ...orderLabels.map((l) => ({
      id: l.id,
      purpose: l.purpose,
      status: l.status,
      creationType: l.creationType,
      trackingNumber: l.trackingNumber,
      carrierCode: l.carrierCode,
      serviceCode: l.serviceCode,
      cost: l.cost,
      currency: l.currency,
      at: l.at,
      actorName: l.actor?.name ?? null,
      paired: true,
      printable: l.printable,
    })),
    ...referenceLabels,
  ];

  const quantity = num(orderRow.quantity);
  return {
    ref,
    order: {
      id: orderRow.id,
      orderRef: orderRow.order_id ?? ref,
      title: orderRow.product_title,
      sku: orderRow.sku,
      quantity,
      platform: orderRow.account_source,
      customerName: orderRow.customer_name,
    },
    shipTo,
    parcel,
    labels,
    unpairedCount: referenceLabels.length,
  };
}

/** The customer ↔ warehouse shipment for a reference-only label. */
async function referenceShipmentSpec(
  orgId: OrgId,
  input: { purpose: IntakePurpose; customer: ShipAddress; parcel: Parcel },
): Promise<ShipmentSpec> {
  const warehouse = await resolveShipFrom(orgId);
  const isReturn = input.purpose === 'return';
  return {
    shipTo: isReturn ? warehouse : input.customer,
    shipFrom: isReturn ? input.customer : warehouse,
    parcels: [input.parcel],
  };
}

export async function rateReferenceLabel(
  orgId: OrgId,
  input: { purpose: IntakePurpose; customer: ShipAddress; parcel: Parcel },
): Promise<RateQuoteResult> {
  const spec = await referenceShipmentSpec(orgId, input);
  const v2 = await getShipStationV2(orgId);
  return v2.getRates(spec);
}

interface ReferencePurchaseInput {
  ref: string;
  purpose: IntakePurpose;
  rateId: string;
  carrierId: string;
  serviceCode: string;
  clientEventId: string;
  customer: ShipAddress;
  parcel: Parcel;
  staffId: number | null;
}

/**
 * Buy a label for an order number that is not in the system. Refuses when the
 * number IS an order — that purchase belongs to the order-bound route.
 */
export async function purchaseReferenceLabel(orgId: OrgId, input: ReferencePurchaseInput): Promise<PurchaseOnceOutcome> {
  const ref = input.ref.trim();
  if (await findOrderByRef(orgId, ref)) {
    throw ApiError.conflict(`Order ${ref} is in the system — buy its label against the order.`);
  }
  const v2 = await getShipStationV2(orgId);
  const buy =
    input.purpose === 'return'
      ? async () => {
          // A return is bought from its shipment (is_return_label), never the rate id.
          const spec = await referenceShipmentSpec(orgId, input);
          return v2.purchaseLabelFromShipment(spec, input.carrierId, input.serviceCode, {
            labelFormat: 'pdf',
            returnLabel: { rmaNumber: ref, outboundLabelId: null },
          });
        }
      : () => v2.purchaseLabelFromRate(input.rateId, { labelFormat: 'pdf' });
  return purchaseLabelOnce(
    {
      orgId,
      orderId: null,
      clientEventId: input.clientEventId,
      rateId: input.rateId,
      labelFormat: 'pdf',
      staffId: input.staffId,
      purpose: input.purpose,
      orderRef: ref,
      shipTo: input.customer,
    },
    buy,
  );
}

/**
 * Attach every unpaired reference-only label under `ref` to the order that now
 * carries that number. A replacement joins the order's tracking; every paired
 * row writes the order's notes trail. Returns how many rows were paired.
 */
export async function pairReferenceLabels(
  orgId: OrgId,
  input: { ref: string; orderId: number; staffId: number | null },
): Promise<number> {
  const ref = input.ref.trim();
  const order = await tenantQuery<{ id: number; order_id: string | null }>(
    orgId,
    `SELECT id, order_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [input.orderId, orgId],
  );
  const row = order.rows[0];
  if (!row) throw ApiError.notFound('order', input.orderId);
  if ((row.order_id ?? '').trim() !== ref) {
    throw ApiError.badRequest(`Order #${input.orderId} does not carry number ${ref}.`);
  }

  const paired = await tenantQuery<{
    id: string | number;
    purpose: LabelPurpose;
    status: LabelLedgerStatus;
    tracking_number: string | null;
    carrier_code: string | null;
    label_id: string | null;
  }>(
    orgId,
    `UPDATE shipping_label_purchases
        SET order_id = $3, linked_by = $4, linked_at = now(), updated_at = now()
      WHERE organization_id = $1 AND order_id IS NULL AND order_ref = $2
        AND status IN ('purchased', 'voided')
      RETURNING id, purpose, status, tracking_number, carrier_code, label_id`,
    [orgId, ref, input.orderId, input.staffId],
  );

  for (const label of paired.rows) {
    if (label.status === 'purchased' && label.purpose === 'replacement' && label.tracking_number) {
      try {
        const trk = await applyOrderTrackingOps({
          orderIds: [input.orderId],
          organizationId: orgId,
          creates: [{ trackingNumber: label.tracking_number }],
        });
        const shipmentId = trk.createdShipmentIds[0] ?? null;
        if (shipmentId != null) await attachLabelPurchaseFacts(orgId, Number(label.id), { shipmentId });
      } catch (e) {
        console.warn('[label-intake] replacement tracking on pair failed', e);
      }
    }
    await createOrderNote({
      orderId: input.orderId,
      organizationId: orgId,
      noteText: labelTrailNote('Linked', label.purpose, {
        carrierCode: label.carrier_code,
        trackingNumber: label.tracking_number,
        labelId: label.label_id,
      }),
      staffId: input.staffId,
    }).catch((e) => console.warn('[label-intake] pair note failed', e));
  }
  return paired.rows.length;
}

/** Where one ledger row's PDF lives (any row in the org — paired or not). */
export async function readIntakeLabelSource(
  orgId: OrgId,
  rowId: number,
): Promise<{ labelUrl: string | null; labelId: string | null } | null> {
  const res = await tenantQuery<{ label_url: string | null; label_id: string | null }>(
    orgId,
    `SELECT label_url, label_id FROM shipping_label_purchases
      WHERE id = $1 AND organization_id = $2 AND status = 'purchased'
      LIMIT 1`,
    [rowId, orgId],
  );
  const r = res.rows[0];
  return r ? { labelUrl: r.label_url, labelId: r.label_id } : null;
}
