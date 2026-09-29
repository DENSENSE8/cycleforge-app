/**
 * An in-app label purchase → the Labels & docs print ledger (`label_ingestions`).
 *
 * A bought label becomes ONE `SHIPSTATION_API` ingestion through the same
 * writer the ShipStation label source uses ({@link recordShipStationLabelIngestion}).
 * Its identity is the ShipStation shipment behind the label (`se-<shipmentId>`,
 * also on the purchase row as `shipstation_shipment_id`), and its client event is
 * {@link shipStationClientEventId} of that shipment — so a replayed purchase, a
 * retried finish or the ShipStation backfill all land on the same row.
 *
 * Paired to the order it was bought for: a MATCHED row is finalized APPLIED
 * (matched_order_id + the order's tracking row + the label document) exactly as
 * the ShipStation source settles it; an order without an exact identity
 * (no order number / account source) is quarantined, then LINKED to the order —
 * the operator-pairing state. Everything here is after the charge and
 * best-effort: callers treat a throw as a warning, never as a failed purchase.
 *
 * Void: {@link removeVoidedLabelIngestion} deletes the label's ingestion (and
 * its staged PDF) so a voided label never sits in — or reprints from — the
 * Labels view.
 */

import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { defaultGcsBucket, gcsAdapter } from '@/lib/photos/storage/gcs-adapter';
import {
  listShipStationIngestions,
  markShipStationIngestionApplied,
  recordShipStationLabelIngestion,
  shipStationClientEventId,
  type PublicLabelIngestion,
  type ShipStationIngestionRecord,
  type ShipStationLabelIngestionInput,
} from '@/lib/label-ingestions/ingestion-service';
import type { ExactOrderIdentity, LabelQuarantineReasonCode, ParsedLabelEvidence } from '@/lib/label-ingestions/types';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { shipmentIdFromLabelId, type LabelPurpose } from '@/lib/shipping/label-purpose';

/** Ledger evidence taken from ShipStation's purchase answer (no PDF text). */
const PURCHASE_EVIDENCE_VERSION = 'shipstation-purchase-v1';

type PurchaseIngestionSkip = 'RETURN_LABEL' | 'NOT_PDF' | 'NO_SHIPMENT_ID' | 'NO_TRACKING';

type PurchaseIngestionPlan =
  | {
      kind: 'record';
      shipstationShipmentId: number;
      labelId: string;
      /** The ledger's client event — stable per ShipStation shipment. */
      clientEventId: string;
      fileBasename: string;
      evidence: ParsedLabelEvidence;
      exactOrder: ExactOrderIdentity | null;
      quarantineReason: LabelQuarantineReasonCode | null;
    }
  | { kind: 'skip'; reason: PurchaseIngestionSkip };

/**
 * What the Labels view records for one bought label. Pure.
 * A return label is never stored as the order's label (finishLabelPurchase),
 * and only a PDF prints from the Labels view.
 */
export function planPurchaseLabelIngestion(input: {
  order: { order_id: string | null; account_source: string | null };
  label: { labelId: string | null; trackingNumber: string | null; carrierCode: string | null };
  labelFormat: string;
  purpose: LabelPurpose;
}): PurchaseIngestionPlan {
  if (input.purpose === 'return') return { kind: 'skip', reason: 'RETURN_LABEL' };
  if (input.labelFormat !== 'pdf') return { kind: 'skip', reason: 'NOT_PDF' };
  const shipstationShipmentId = shipmentIdFromLabelId(input.label.labelId);
  if (shipstationShipmentId == null) return { kind: 'skip', reason: 'NO_SHIPMENT_ID' };
  const trackingRaw = input.label.trackingNumber?.trim() ?? '';
  const trackingNormalized = trackingRaw ? normalizeTrackingNumber(trackingRaw) : '';
  if (!trackingNormalized) return { kind: 'skip', reason: 'NO_TRACKING' };

  const marketplaceOrderId = input.order.order_id?.trim() || null;
  const accountSource = input.order.account_source?.trim() || null;
  const exactOrder: ExactOrderIdentity | null =
    marketplaceOrderId && accountSource
      ? { accountSource, marketplaceOrderId, matchMethod: 'MARKETPLACE_ORDER_ID', cycleforgeReference: null }
      : null;
  return {
    kind: 'record',
    shipstationShipmentId,
    labelId: `se-${shipstationShipmentId}`,
    clientEventId: shipStationClientEventId(shipstationShipmentId),
    fileBasename: `label-${trackingNormalized}.pdf`,
    evidence: {
      parserVersion: PURCHASE_EVIDENCE_VERSION,
      cycleforgeReference: null,
      marketplaceOrderId,
      accountSource: null,
      trackingNumberRaw: trackingRaw,
      trackingNumberNormalized: trackingNormalized,
      carrier: shipStationCarrierToStored(input.label.carrierCode) ?? detectCarrier(trackingNormalized),
      multiPackageEvidence: false,
    },
    exactOrder,
    quarantineReason: exactOrder ? null : 'MISSING_ACCOUNT_CONTEXT',
  };
}

const SKIP_WARNING: Record<PurchaseIngestionSkip, string | null> = {
  RETURN_LABEL: null,
  NOT_PDF: null,
  NO_SHIPMENT_ID: 'Label purchased, but ShipStation gave no shipment id — it was not added to the Labels view.',
  NO_TRACKING: 'Label purchased, but ShipStation gave no tracking number — it was not added to the Labels view.',
};

export interface PurchaseLabelIngestionDeps {
  findByShipment(orgId: OrgId, shipstationShipmentId: number): Promise<PublicLabelIngestion | null>;
  record(input: ShipStationLabelIngestionInput): Promise<ShipStationIngestionRecord>;
  markApplied(
    orgId: OrgId,
    input: { ingestionId: number; expectedRowVersion: number; orderIds: number[]; shipmentId: number; documentId: number },
  ): Promise<PublicLabelIngestion>;
  /** QUARANTINED → LINKED to the order (operator-pairing state); no-op otherwise. */
  link(orgId: OrgId, input: { ingestionId: number; orderId: number; staffId: number | null }): Promise<void>;
  now(): Date;
}

const defaultDeps: PurchaseLabelIngestionDeps = {
  findByShipment: async (orgId, shipstationShipmentId) =>
    (await listShipStationIngestions(orgId, [shipstationShipmentId]))[0] ?? null,
  record: (input) => recordShipStationLabelIngestion(input),
  markApplied: (orgId, input) => markShipStationIngestionApplied(orgId, input),
  link: async (orgId, { ingestionId, orderId, staffId }) => {
    await tenantQuery(
      orgId,
      `UPDATE label_ingestions
          SET state = 'LINKED', matched_order_id = $3, actor_staff_id = $4, row_version = row_version + 1
        WHERE organization_id = $1 AND id = $2 AND state = 'QUARANTINED'`,
      [orgId, ingestionId, orderId, staffId],
    );
  },
  now: () => new Date(),
};

/**
 * Put one bought label in the Labels view, paired to its order — or, with
 * `orderId: null` (a label bought outright), recorded unpaired for the desk's
 * "No order" card. Idempotent per ShipStation shipment: an existing row is
 * settled (never re-recorded), and `loadBytes` is only called when no row
 * exists yet. Throws on storage / DB failure — the caller turns that into a
 * warning.
 */
export async function recordPurchaseLabelIngestion(
  input: {
    orgId: OrgId;
    orderId: number | null;
    order: { order_id: string | null; account_source: string | null };
    label: { labelId: string | null; trackingNumber: string | null; carrierCode: string | null };
    labelFormat: string;
    purpose: LabelPurpose;
    staffId: number | null;
    /** The order's tracking row for this label (shipping_tracking_numbers.id), when registered. */
    trackingShipmentId: number | null;
    /** The stored `shipping_label` document, when stored. */
    labelDocumentId: number | null;
    /** The label PDF (fresh purchase), or how to fetch it (a replay whose bytes were not re-downloaded). */
    loadBytes: () => Promise<Buffer>;
  },
  deps: PurchaseLabelIngestionDeps = defaultDeps,
): Promise<{ labelIngestionId: number | null; warning: string | null }> {
  const plan = planPurchaseLabelIngestion(input);
  if (plan.kind === 'skip') return { labelIngestionId: null, warning: SKIP_WARNING[plan.reason] };

  let ingestion = await deps.findByShipment(input.orgId, plan.shipstationShipmentId);
  if (!ingestion) {
    const recorded = await deps.record({
      organizationId: input.orgId,
      shipmentId: plan.shipstationShipmentId,
      labelId: plan.labelId,
      observedAt: deps.now().toISOString(),
      fileBasename: plan.fileBasename,
      bytes: await input.loadBytes(),
      evidence: plan.evidence,
      exactOrder: plan.exactOrder,
      quarantineReason: plan.quarantineReason,
    });
    // Byte-identical PDF already in the ledger (e.g. uploaded by hand): that row
    // IS this label — point at it, never rewrite someone else's row.
    if (recorded.outcome === 'DUPLICATE_PDF') return { labelIngestionId: recorded.ingestion.id, warning: null };
    ingestion = recorded.ingestion;
  }

  // No order to pair with: the row stays as recorded (unpaired, or whatever an
  // earlier writer settled it to).
  const orderId = input.orderId;
  if (orderId == null) return { labelIngestionId: ingestion.id, warning: null };

  if (ingestion.state === 'QUARANTINED') {
    await deps.link(input.orgId, { ingestionId: ingestion.id, orderId, staffId: input.staffId });
    return { labelIngestionId: ingestion.id, warning: null };
  }
  if (ingestion.state === 'MATCHED') {
    if (input.trackingShipmentId == null || input.labelDocumentId == null) {
      return {
        labelIngestionId: ingestion.id,
        warning:
          'Label purchased and added to the Labels view, but not yet paired to the order (its tracking or document did not save). Buying again under this purchase retries without a second charge.',
      };
    }
    await deps.markApplied(input.orgId, {
      ingestionId: ingestion.id,
      expectedRowVersion: ingestion.rowVersion,
      orderIds: [orderId],
      shipmentId: input.trackingShipmentId,
      documentId: input.labelDocumentId,
    });
  }
  return { labelIngestionId: ingestion.id, warning: null };
}

/**
 * A voided label leaves the Labels view: delete its ingestion (print log and
 * order links cascade; the purchase row's `label_ingestion_id` nulls) and its
 * staged PDF. Deleted even when printed — an APPLIED row is terminal (cannot
 * be quarantined), its document reference would block the void's label
 * document delete, and a voided label must never be reprinted. Returns the
 * deleted ingestion ids.
 */
export async function removeVoidedLabelIngestion(orgId: OrgId, labelId: string): Promise<number[]> {
  const shipstationShipmentId = shipmentIdFromLabelId(labelId);
  if (shipstationShipmentId == null) return [];
  const deleted = await withTenantTransaction(orgId, (client) =>
    client.query<{ id: string; staged_object_key: string | null }>(
      `DELETE FROM label_ingestions
        WHERE organization_id = $1 AND source = 'SHIPSTATION_API' AND shipstation_shipment_id = $2
        RETURNING id, staged_object_key`,
      [orgId, shipstationShipmentId],
    ),
  );
  for (const row of deleted.rows) {
    if (!row.staged_object_key) continue;
    try {
      await gcsAdapter.deleteObject({ bucket: defaultGcsBucket(), objectKey: row.staged_object_key });
    } catch (error) {
      console.warn('[void-label] staged label PDF delete failed', error);
    }
  }
  return deleted.rows.map((row) => Number(row.id));
}
