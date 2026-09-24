/**
 * Label purchase ledger — the idempotency record for ShipStation label buys
 * (`shipping_label_purchases`, migration 2026-09-24f).
 *
 * The purchase route used to dedupe on the stored label DOCUMENT, which is
 * written after the irreversible charge: a buy that succeeded and then died in
 * the byte download / document store left no trace, and the retry bought a
 * second label. {@link purchaseLabelOnce} claims the key BEFORE the charge and
 * records the purchase the moment ShipStation answers — before any download —
 * so every retry either replays the recorded purchase or is refused.
 *
 * Outcomes:
 *   purchased — this call bought the label (and recorded it).
 *   replay    — a prior call under this key already bought it; nothing charged.
 *   in_flight — a prior call claimed the key and never recorded an outcome
 *               (still running, or it died mid-charge). Refuse; the operator
 *               checks ShipStation before buying again.
 *
 * ShipStation refusing the purchase (nothing charged) releases the claim so the
 * same key may try again.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import type { LabelPurchaseResult } from '@/lib/shipping/shipstation/types';

export type LabelPurchaseStatus = 'pending' | 'purchased' | 'voided';

export interface LabelPurchaseRecord {
  id: number;
  orderId: number | null;
  clientEventId: string;
  status: LabelPurchaseStatus;
  labelId: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  labelFormat: string | null;
  labelUrl: string | null;
  labelDocumentId: number | null;
  shipmentId: number | null;
}

export interface ClaimInput {
  orgId: OrgId;
  orderId: number;
  clientEventId: string;
  rateId: string;
  labelFormat: string;
  staffId: number | null;
}

export interface RecordPurchasedInput {
  orgId: OrgId;
  purchaseId: number;
  label: LabelPurchaseResult;
  labelUrl: string | null;
}

export interface LabelPurchaseLedgerDeps {
  /** Insert a `pending` row; `null` when the key is already claimed. */
  claim: (input: ClaimInput) => Promise<{ id: number } | null>;
  /** The existing row for this key (after a lost claim). */
  find: (orgId: OrgId, clientEventId: string) => Promise<LabelPurchaseRecord | null>;
  /** `pending` → `purchased`, with everything a retry needs to replay. */
  recordPurchased: (input: RecordPurchasedInput) => Promise<LabelPurchaseRecord>;
  /** Drop a `pending` claim after ShipStation refused (nothing charged). */
  release: (orgId: OrgId, purchaseId: number) => Promise<void>;
}

export type PurchaseOnceOutcome =
  | { kind: 'purchased'; label: LabelPurchaseResult; labelUrl: string | null; record: LabelPurchaseRecord }
  | { kind: 'replay'; record: LabelPurchaseRecord }
  | { kind: 'in_flight'; record: LabelPurchaseRecord | null };

/** The URL to fetch the bytes from — pdf first, the generic href as the fallback. */
export function pickLabelUrl(label: Pick<LabelPurchaseResult, 'labelDownload'>): string | null {
  const d = label.labelDownload;
  return d.pdf || d.href || d.png || d.zpl || null;
}

export async function purchaseLabelOnce(
  input: ClaimInput,
  buy: () => Promise<LabelPurchaseResult>,
  deps: LabelPurchaseLedgerDeps = defaultLedgerDeps,
): Promise<PurchaseOnceOutcome> {
  const claimed = await deps.claim(input);
  if (!claimed) {
    const record = await deps.find(input.orgId, input.clientEventId);
    if (record && record.status !== 'pending') return { kind: 'replay', record };
    return { kind: 'in_flight', record };
  }

  let label: LabelPurchaseResult;
  try {
    label = await buy();
  } catch (error) {
    // ShipStation answered with a refusal (or never answered) — the charge
    // did not go through on our side, so free the key for an honest retry.
    await deps.release(input.orgId, claimed.id).catch((e) => {
      console.warn('[label-purchase] release of pending claim failed', e);
    });
    throw error;
  }

  const labelUrl = pickLabelUrl(label);
  // The charge happened. If this write fails the row stays `pending`, which
  // refuses every retry — a stuck key is recoverable, a second charge is not.
  const record = await deps.recordPurchased({ orgId: input.orgId, purchaseId: claimed.id, label, labelUrl });
  return { kind: 'purchased', label, labelUrl, record };
}

// ─── SQL (default deps) ─────────────────────────────────────────────────────

type Row = {
  id: string | number;
  order_id: number | null;
  client_event_id: string;
  status: LabelPurchaseStatus;
  label_id: string | null;
  tracking_number: string | null;
  carrier_code: string | null;
  service_code: string | null;
  cost: string | number | null;
  currency: string | null;
  label_format: string | null;
  label_url: string | null;
  label_document_id: number | null;
  shipment_id: number | null;
};

const RETURNING = `id, order_id, client_event_id, status, label_id, tracking_number, carrier_code,
  service_code, cost, currency, label_format, label_url, label_document_id, shipment_id`;

function toRecord(row: Row): LabelPurchaseRecord {
  return {
    id: Number(row.id),
    orderId: row.order_id,
    clientEventId: row.client_event_id,
    status: row.status,
    labelId: row.label_id,
    trackingNumber: row.tracking_number,
    carrierCode: row.carrier_code,
    serviceCode: row.service_code,
    cost: row.cost == null ? null : Number(row.cost),
    currency: row.currency,
    labelFormat: row.label_format,
    labelUrl: row.label_url,
    labelDocumentId: row.label_document_id,
    shipmentId: row.shipment_id,
  };
}

export const defaultLedgerDeps: LabelPurchaseLedgerDeps = {
  claim: async ({ orgId, orderId, clientEventId, rateId, labelFormat, staffId }) => {
    const res = await tenantQuery<{ id: string }>(
      orgId,
      `INSERT INTO shipping_label_purchases
         (organization_id, order_id, client_event_id, status, rate_id, label_format, purchased_by)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)
       ON CONFLICT (organization_id, client_event_id) DO NOTHING
       RETURNING id`,
      [orgId, orderId, clientEventId, rateId, labelFormat, staffId],
    );
    return res.rows[0] ? { id: Number(res.rows[0].id) } : null;
  },
  find: (orgId, clientEventId) => findLabelPurchase(orgId, clientEventId),
  recordPurchased: async ({ orgId, purchaseId, label, labelUrl }) => {
    const res = await tenantQuery<Row>(
      orgId,
      `UPDATE shipping_label_purchases
          SET status = 'purchased', label_id = $3, tracking_number = $4, carrier_code = $5,
              service_code = $6, cost = $7, currency = $8, label_url = $9, updated_at = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING ${RETURNING}`,
      [
        purchaseId,
        orgId,
        label.labelId ?? null,
        label.trackingNumber,
        label.carrierCode ?? null,
        label.serviceCode ?? null,
        label.cost ?? null,
        label.currency ?? null,
        labelUrl,
      ],
    );
    if (!res.rows[0]) throw new Error(`label purchase ${purchaseId} vanished before it was recorded`);
    return toRecord(res.rows[0]);
  },
  release: async (orgId, purchaseId) => {
    await tenantQuery(
      orgId,
      `DELETE FROM shipping_label_purchases
        WHERE id = $1 AND organization_id = $2 AND status = 'pending'`,
      [purchaseId, orgId],
    );
  },
};

export async function findLabelPurchase(
  orgId: OrgId,
  clientEventId: string,
): Promise<LabelPurchaseRecord | null> {
  const res = await tenantQuery<Row>(
    orgId,
    `SELECT ${RETURNING} FROM shipping_label_purchases
      WHERE organization_id = $1 AND client_event_id = $2
      LIMIT 1`,
    [orgId, clientEventId],
  );
  return res.rows[0] ? toRecord(res.rows[0]) : null;
}

/** Attach what the route learned after the charge (document, STN row). */
export async function attachLabelPurchaseFacts(
  orgId: OrgId,
  purchaseId: number,
  facts: { labelDocumentId?: number | null; shipmentId?: number | null },
): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE shipping_label_purchases
        SET label_document_id = COALESCE($3, label_document_id),
            shipment_id = COALESCE($4, shipment_id),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [purchaseId, orgId, facts.labelDocumentId ?? null, facts.shipmentId ?? null],
  );
}

/** The void route's stamp — a voided key is never bought against again. */
export async function markLabelPurchaseVoided(orgId: OrgId, labelId: string): Promise<void> {
  await tenantQuery(
    orgId,
    `UPDATE shipping_label_purchases
        SET status = 'voided', updated_at = now()
      WHERE organization_id = $1 AND label_id = $2 AND status = 'purchased'`,
    [orgId, labelId],
  );
}
