/**
 * Shipping labels from the chat — quote, buy, void — on the desk's own paths:
 * `buildOrderShipmentSpec` + the v2 engine for rates, `purchaseLabelOnce` +
 * `finishLabelPurchase` for the buy (tracking on the order, label PDF +
 * packing slip in documents, ledger row), `voidOrderLabel` for the void.
 *
 * The chat tools (`src/lib/assistant/tools/label-tools.ts`) pass only
 * identifiers and the operator's own parcel words; every price, rate id and
 * address comes from here. Buy and void run on the operator's confirmation
 * (`label-write-dispatch.ts`), idempotent under the payload's `clientEventId`.
 * The engine enforces test-label mode (`shipstation/test-mode.ts`).
 */

import 'server-only';
import { z } from 'zod';
import pool from '@/lib/db';
import { ApiError } from '@/lib/api';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { publishOrderChanged, publishShipmentChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { sendEmailBestEffort } from '@/lib/email/send';
import { createOrderNote } from '@/lib/orders/order-notes';
import { labelTrailNote } from '@/lib/shipping/order-label-links';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { LABEL_PURPOSES, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { purchaseLabelOnce } from '@/lib/shipping/label-purchase-ledger';
import {
  buildShipEmail,
  finishLabelPurchase,
  loadLabelOrder,
  purchasedLabelFromRecord,
  resolveCustomerEmail,
  voidOrderLabel,
  type PurchasedLabel,
} from '@/lib/shipping/order-label-purchase';
import {
  getShipStationV2,
  ShipFromNotConfiguredError,
  ShipStationNotConnectedError,
} from '@/lib/shipping/shipstation/config';
import { ShipStationApiError, type ShipStationV2Client } from '@/lib/shipping/shipstation/client';
import { OrderRateDimensionsSchema } from '@/lib/shipping/shipstation/order-parcel';
import { buildOrderShipmentSpec, ORDER_SPEC_MISSING } from '@/lib/shipping/shipstation/order-shipment-spec';
import type { Parcel, ShippingRateOption } from '@/lib/shipping/shipstation/types';

/** The engine the chat buys through — `getShipStationV2` (a DI seam for the write-path smoke). */
export const chatLabelEngine: { resolve: (orgId: OrgId) => Promise<ShipStationV2Client> } = {
  resolve: getShipStationV2,
};

// ─── Quote ──────────────────────────────────────────────────────────────────

export interface ChatLabelQuoteInput {
  orderId: number;
  purpose: LabelPurpose;
  weightOz: number | null;
  dimensions: Parcel['dimensions'] | null;
}

export type ChatLabelQuote =
  | { kind: 'needs'; missing: Array<'weight' | 'ship_to'>; dimensionsMissing: boolean }
  | { kind: 'unavailable'; code: string; error: string }
  | {
      kind: 'quoted';
      /** Where the parcel goes, for the face only ("Austin, TX 78701"). */
      destination: string;
      parcel: Parcel;
      rates: ShippingRateOption[];
      invalid: string[];
      /** Test-label mode, and whether it can buy (a sandbox key). */
      testMode: boolean;
      sandbox: boolean;
    };

function engineUnavailable(error: unknown): ChatLabelQuote | null {
  if (error instanceof ShipStationNotConnectedError) return { kind: 'unavailable', code: 'SHIPSTATION_NOT_CONNECTED', error: error.message };
  if (error instanceof ShipFromNotConfiguredError) return { kind: 'unavailable', code: 'SHIP_FROM_NOT_CONFIGURED', error: error.message };
  if (error instanceof ShipStationApiError) return { kind: 'unavailable', code: 'SHIPSTATION_ERROR', error: error.message };
  return null;
}

export async function quoteChatLabel(orgId: OrgId, input: ChatLabelQuoteInput): Promise<ChatLabelQuote> {
  try {
    const built = await buildOrderShipmentSpec(orgId, {
      orderId: input.orderId,
      weightOzOverride: input.weightOz,
      dimensions: input.dimensions,
      purpose: input.purpose,
    });
    const engine = await chatLabelEngine.resolve(orgId);
    const quote = await engine.getRates(built.spec);
    const to = built.spec.shipTo;
    return {
      kind: 'quoted',
      destination: [to.cityLocality, [to.stateProvince, to.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      parcel: built.parcel,
      rates: quote.rates,
      invalid: quote.invalidRates.map((r) => [r.carrierCode, r.serviceCode, r.message].filter(Boolean).join(' · ')).slice(0, 5),
      testMode: engine.testMode,
      sandbox: engine.sandbox,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.details === ORDER_SPEC_MISSING.weight || error.details === ORDER_SPEC_MISSING.shipTo)) {
      return {
        kind: 'needs',
        missing: [error.details === ORDER_SPEC_MISSING.shipTo ? 'ship_to' : 'weight'],
        dimensionsMissing: input.dimensions == null,
      };
    }
    const unavailable = engineUnavailable(error);
    if (unavailable) return unavailable;
    throw error;
  }
}

// ─── Buy ────────────────────────────────────────────────────────────────────

const staffId = z.number().int().positive().nullable();

/** What `buy_label` files: the SERVER quote's rate, never a model-typed price. */
export const chatLabelBuyPayload = z
  .object({
    orderId: z.number().int().positive(),
    orderRef: z.string().min(1).max(120),
    purpose: z.enum(LABEL_PURPOSES),
    /** The idempotency key — a second confirm replays, never re-charges. */
    clientEventId: z.string().min(8).max(120),
    rateId: z.string().min(1).max(120),
    carrierId: z.string().max(120),
    carrierCode: z.string().max(80),
    carrierName: z.string().max(120),
    serviceCode: z.string().max(120),
    serviceName: z.string().max(160),
    total: z.number().nonnegative(),
    currency: z.string().min(3).max(3),
    deliveryDays: z.number().nullable(),
    destination: z.string().max(200),
    weightOz: z.number().positive().nullable(),
    dimensions: OrderRateDimensionsSchema.nullable(),
    /** The engine at quote time: test-label mode, and a sandbox key that can buy in it. */
    testMode: z.boolean(),
    sandbox: z.boolean(),
    staffId,
  })
  .strict();
export type ChatLabelBuyPayload = z.infer<typeof chatLabelBuyPayload>;

export type ChatLabelWriteResult = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string };

function refusal(error: unknown): ChatLabelWriteResult | null {
  if (error instanceof ShipStationNotConnectedError || error instanceof ShipFromNotConfiguredError) {
    return { ok: false, status: 409, error: `${error.message} Nothing was bought.` };
  }
  if (error instanceof ShipStationApiError) {
    return { ok: false, status: 409, error: `ShipStation refused: ${error.message} Nothing was charged${/rate/i.test(error.message) ? ' — get fresh rates and try again' : ''}.` };
  }
  if (error instanceof ApiError && error.statusCode < 500) {
    return { ok: false, status: error.statusCode === 404 ? 404 : 400, error: error.message };
  }
  return null;
}

/** Buy the confirmed rate for the order. Idempotent under `clientEventId`. */
export async function buyChatLabel(orgId: OrgId, p: ChatLabelBuyPayload): Promise<ChatLabelWriteResult> {
  try {
    const order = await loadLabelOrder(orgId, p.orderId);
    if (!order) return { ok: false, status: 404, error: `Order ${p.orderRef} no longer exists. Nothing was bought.` };
    const v2 = await chatLabelEngine.resolve(orgId);
    const buy =
      p.purpose === 'return'
        ? async () => {
            const { spec } = await buildOrderShipmentSpec(orgId, { orderId: p.orderId, weightOzOverride: p.weightOz, dimensions: p.dimensions, purpose: 'return' });
            const outbound = await tenantQuery<{ label_id: string }>(
              orgId,
              `SELECT label_id FROM shipping_label_purchases
                WHERE organization_id = $1 AND order_id = $2 AND purpose = 'outbound'
                  AND status = 'purchased' AND label_id IS NOT NULL
                ORDER BY created_at DESC LIMIT 1`,
              [orgId, p.orderId],
            );
            return v2.purchaseLabelFromShipment(spec, p.carrierId, p.serviceCode, {
              labelFormat: 'pdf',
              returnLabel: { rmaNumber: p.orderRef, outboundLabelId: outbound.rows[0]?.label_id ?? null },
            });
          }
        : () => v2.purchaseLabelFromRate(p.rateId, { labelFormat: 'pdf' });

    const outcome = await purchaseLabelOnce(
      { orgId, orderId: p.orderId, clientEventId: p.clientEventId, rateId: p.rateId, labelFormat: 'pdf', staffId: p.staffId, purpose: p.purpose, isTest: v2.sandbox },
      buy,
    );
    if (outcome.kind === 'in_flight') {
      return { ok: false, status: 409, error: 'This purchase is already in progress or did not finish. Check ShipStation for a new label on this order before buying again.' };
    }
    if (outcome.kind === 'replay' && outcome.record.status === 'voided') {
      return { ok: false, status: 409, error: 'That label was voided. Get fresh rates to buy a new one.' };
    }

    const label: PurchasedLabel =
      outcome.kind === 'replay'
        ? purchasedLabelFromRecord(outcome.record)
        : {
            ...purchasedLabelFromRecord(outcome.record),
            labelId: outcome.label.labelId ?? null,
            trackingNumber: outcome.label.trackingNumber,
            carrierCode: outcome.label.carrierCode ?? null,
            serviceCode: outcome.label.serviceCode ?? null,
            cost: outcome.label.cost ?? null,
            currency: outcome.label.currency ?? null,
            labelUrl: outcome.labelUrl,
          };
    const finished = await finishLabelPurchase({
      orgId,
      order,
      orderId: p.orderId,
      orderRef: p.orderRef,
      clientEventId: p.clientEventId,
      labelFormat: 'pdf',
      staffId: p.staffId,
      v2,
      label,
      knownShipmentId: outcome.record.shipmentId,
      knownDocumentId: outcome.record.labelDocumentId,
      purpose: outcome.record.purpose,
    });
    if (outcome.kind === 'replay') return { ok: true };

    await recordAudit(pool, null, null, {
      source: 'assistant.buy_label',
      action: AUDIT_ACTION.LABEL_PURCHASED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: p.orderId,
      after: {
        tracking: label.trackingNumber,
        carrier: label.carrierCode,
        service: label.serviceCode,
        cost: label.cost,
        currency: label.currency,
        labelId: label.labelId,
        rateId: p.rateId,
        purpose: p.purpose,
        creationType: 'bought_in_app',
        via: 'chat',
        test: v2.sandbox,
      },
      extra: { shipmentId: finished.shipmentId, labelDocumentId: finished.labelDocumentId, clientEventId: p.clientEventId, purchaseId: label.purchaseId },
      actorStaffIdOverride: p.staffId,
      organizationIdOverride: orgId,
    });
    if (p.purpose !== 'outbound') {
      await createOrderNote({ orderId: p.orderId, organizationId: orgId, noteText: labelTrailNote('Bought', p.purpose, label), staffId: p.staffId }).catch((e) =>
        console.warn('[chat-buy-label] order note failed', e),
      );
    }
    // Post-charge fan-out, off the confirmation's transaction.
    void (async () => {
      try {
        await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
        await publishOrderChanged({ organizationId: orgId, orderIds: [p.orderId], source: 'assistant.buy-label' });
        if (finished.shipmentId) {
          await publishShipmentChanged({ organizationId: orgId, shipmentId: finished.shipmentId, trackingNumber: label.trackingNumber, carrier: shipStationCarrierToStored(label.carrierCode), source: 'assistant.buy-label' });
        }
      } catch (e) {
        console.warn('[chat-buy-label] realtime/cache failed', e);
      }
      // Same rule as the desk: the buyer hears about a parcel coming to them — never a return, never a test label.
      if (p.purpose !== 'return' && !v2.sandbox) {
        try {
          const email = await resolveCustomerEmail(orgId, order);
          if (email) await sendEmailBestEffort(buildShipEmail(email, p.orderRef, label));
        } catch (e) {
          console.warn('[chat-buy-label] customer notification failed', e);
        }
      }
    })();
    return { ok: true };
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    throw error;
  }
}

// ─── Void ───────────────────────────────────────────────────────────────────

export interface VoidableLabel {
  purchaseId: number;
  labelId: string;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  shipmentId: number | null;
  labelDocumentId: number | null;
  purpose: LabelPurpose;
  isTest: boolean;
  createdAt: string;
}

/** The order's bought, not-yet-voided labels (ledger rows), newest first. */
export async function listVoidableLabels(orgId: OrgId, orderId: number): Promise<VoidableLabel[]> {
  const res = await tenantQuery<{
    id: string; label_id: string; tracking_number: string | null; carrier_code: string | null; service_code: string | null;
    cost: string | null; currency: string | null; shipment_id: number | null; label_document_id: number | null;
    purpose: LabelPurpose; is_test: boolean; created_at: Date;
  }>(
    orgId,
    `SELECT id, label_id, tracking_number, carrier_code, service_code, cost, currency, shipment_id,
            label_document_id, purpose, is_test, created_at
       FROM shipping_label_purchases
      WHERE organization_id = $1 AND order_id = $2 AND status = 'purchased' AND label_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20`,
    [orgId, orderId],
  );
  return res.rows.map((r) => ({
    purchaseId: Number(r.id),
    labelId: r.label_id,
    trackingNumber: r.tracking_number,
    carrierCode: r.carrier_code,
    serviceCode: r.service_code,
    cost: r.cost == null ? null : Number(r.cost),
    currency: r.currency,
    shipmentId: r.shipment_id,
    labelDocumentId: r.label_document_id,
    purpose: r.purpose,
    isTest: r.is_test === true,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export const chatLabelVoidPayload = z
  .object({
    orderId: z.number().int().positive(),
    orderRef: z.string().min(1).max(120),
    purchaseId: z.number().int().positive(),
    labelId: z.string().min(1).max(120),
    trackingNumber: z.string().max(80).nullable(),
    carrierCode: z.string().max(80).nullable(),
    serviceCode: z.string().max(120).nullable(),
    cost: z.number().nullable(),
    currency: z.string().max(3).nullable(),
    isTest: z.boolean(),
    reason: z.string().trim().min(1).max(300),
    staffId,
  })
  .strict();
export type ChatLabelVoidPayload = z.infer<typeof chatLabelVoidPayload>;

/** Void the confirmed label. The ledger row is re-read: a label already voided is not voided twice. */
export async function voidChatLabel(orgId: OrgId, p: ChatLabelVoidPayload): Promise<ChatLabelWriteResult> {
  try {
    const current = (await listVoidableLabels(orgId, p.orderId)).find((l) => l.purchaseId === p.purchaseId && l.labelId === p.labelId);
    if (!current) return { ok: false, status: 409, error: `That label on order ${p.orderRef} is no longer an active purchase (already voided?). Nothing was changed.` };
    const v2 = await chatLabelEngine.resolve(orgId);
    // Test mode voids test labels only — a live label bought elsewhere is never touched from here.
    if (v2.testMode && !current.isTest) {
      return { ok: false, status: 409, error: 'Test-label mode: only TEST labels can be voided in this environment, and this is a live label. Nothing was voided.' };
    }
    const result = await voidOrderLabel(orgId, v2, {
      orderId: p.orderId,
      labelId: p.labelId,
      shipmentId: current.shipmentId,
      documentId: current.labelDocumentId,
    });
    if (!result.approved) return { ok: false, status: 409, error: `The carrier declined the void: ${result.message || 'no reason given'}. The label is still active.` };

    await recordAudit(pool, null, null, {
      source: 'assistant.void_label',
      action: AUDIT_ACTION.LABEL_VOIDED,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: p.orderId,
      reasonCode: p.reason,
      before: { labelId: p.labelId, tracking: p.trackingNumber },
      extra: { shipmentId: current.shipmentId, documentId: current.labelDocumentId, purchaseId: p.purchaseId, test: current.isTest },
      actorStaffIdOverride: p.staffId,
      organizationIdOverride: orgId,
    });
    void (async () => {
      try {
        await invalidateCacheTags(['orders', 'shipped', 'orders-next']);
        await publishOrderChanged({ organizationId: orgId, orderIds: [p.orderId], source: 'assistant.void-label' });
      } catch (e) {
        console.warn('[chat-void-label] realtime/cache failed', e);
      }
    })();
    return { ok: true };
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    throw error;
  }
}
