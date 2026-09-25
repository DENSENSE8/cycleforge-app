/**
 * Production IO for the ShipStation historical-label backfill
 * (./shipstation-history.ts). Every write goes through an existing pipeline:
 * the label-ingestion ledger, the ShipStation sync's tracking attach, and the
 * outbound document store the in-app label purchase uses.
 */
import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getShipStationV1, getShipStationV2 } from '@/lib/shipping/shipstation/config';
import type { ShipStationV1Shipment } from '@/lib/shipping/shipstation/orders-v1';
import { trackingDeps } from '@/lib/integrations/connectors/shipstation';
import { storeOutboundDocumentFromBytes } from '@/lib/documents/outbound-documents';
import {
  listShipStationIngestions,
  markShipStationIngestionApplied,
  recordShipStationLabelIngestion,
  resolveQuarantinedShipStationIngestion,
} from '../ingestion-service';
import type { ShipStationHistoryDeps } from './shipstation-history';

const PAGE_SIZE = 500;
const MAX_PAGES = 50;

/** The document-store dedupe key of a ShipStation label (one document per label). */
function shipStationLabelSourceHash(labelId: string): string {
  return `shipstation-label:${labelId}`;
}

export async function createShipStationHistoryDeps(orgId: OrgId): Promise<ShipStationHistoryDeps> {
  const v1 = await getShipStationV1(orgId);
  if (!v1) throw new Error('ShipStation v1 key/secret are not configured — the shipments feed needs them.');
  const v2 = await getShipStationV2(orgId);

  return {
    listShipments: async (since) => {
      const shipments: ShipStationV1Shipment[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await v1.listShipments({ createDateStart: since.toISOString(), page, pageSize: PAGE_SIZE });
        shipments.push(...res.shipments);
        if (page >= res.pages) return shipments;
      }
      throw new Error(`ShipStation shipments exceed ${MAX_PAGES * PAGE_SIZE} rows — narrow the window.`);
    },
    findIngestions: (shipmentIds) => listShipStationIngestions(orgId, shipmentIds),
    findOrders: (orderNumbers) =>
      orderNumbers.length === 0 ? Promise.resolve([]) : trackingDeps.findOrders(orgId, orderNumbers),
    findPurchasedLabelIds: async (labelIds) => {
      if (labelIds.length === 0) return new Set();
      const res = await tenantQuery<{ label_id: string }>(
        orgId,
        `SELECT label_id
           FROM shipping_label_purchases
          WHERE organization_id = $1
            AND label_id = ANY($2::text[])
            AND creation_type = 'bought_in_app'
            AND label_document_id IS NOT NULL`,
        [orgId, labelIds],
      );
      return new Set(res.rows.map((r) => r.label_id));
    },
    findListedLabelIds: async (labelIds) => {
      if (labelIds.length === 0) return new Set();
      const res = await tenantQuery<{ label_id: string }>(
        orgId,
        `SELECT DISTINCT label_id
           FROM shipping_label_purchases
          WHERE organization_id = $1
            AND label_id = ANY($2::text[])
            AND creation_type <> 'bought_in_app'`,
        [orgId, labelIds],
      );
      return new Set(res.rows.map((r) => r.label_id));
    },
    // Same client key as the 2026-09-24j backfill, so a label is listed once.
    recordListedLabel: async (input) => {
      await tenantQuery(
        orgId,
        `INSERT INTO shipping_label_purchases
           (organization_id, order_id, client_event_id, status, label_id, tracking_number, carrier_code,
            service_code, cost, insurance_cost, currency, purpose, creation_type, shipstation_shipment_id,
            label_ingestion_id, label_document_id, shipment_id, linked_at)
         SELECT $1, $2, 'shipstation-import:' || $3, 'purchased', $3, $4, $5, $6, $7, $8, 'USD', $9,
                'imported_shipstation', $10, li.id, li.document_id, li.shipment_id, now()
           FROM (SELECT 1) AS one
           LEFT JOIN label_ingestions li ON li.organization_id = $1 AND li.id = $11
         ON CONFLICT DO NOTHING`,
        [
          orgId, input.orderId, input.labelId, input.trackingNumber, input.carrierCode, input.serviceCode,
          input.shipmentCost, input.insuranceCost, input.purpose, input.shipmentId, input.ingestionId,
        ],
      );
    },
    getLabel: (labelId) => v2.getLabel(labelId),
    downloadLabel: (url) => v2.downloadLabel(url),
    recordIngestion: async (input) => recordShipStationLabelIngestion({ ...input, organizationId: orgId }),
    promoteQuarantined: (ingestion, evidence, exactOrder) =>
      resolveQuarantinedShipStationIngestion(orgId, ingestion, evidence, exactOrder),
    attachTracking: ({ orderIds, trackingNumber, carrier }) =>
      trackingDeps.attachPrimaryTracking({ orgId, orderIds, trackingNumber, carrier }),
    findShipmentRow: async (trackingNumberNormalized) => {
      const res = await tenantQuery<{ id: number | string }>(
        orgId,
        `SELECT id
           FROM shipping_tracking_numbers
          WHERE organization_id = $1
            AND tracking_number_normalized = $2
          ORDER BY id ASC
          LIMIT 1`,
        [orgId, trackingNumberNormalized],
      );
      return res.rows[0] ? Number(res.rows[0].id) : null;
    },
    storeLabelDocument: async ({ orderId, orderRef, labelId, bytes, trackingNumber, carrier }) => {
      const stored = await storeOutboundDocumentFromBytes(orgId, {
        orderId,
        orderRef,
        documentType: 'shipping_label',
        platform: 'shipstation',
        source: 'shipstation_history',
        buffer: bytes,
        contentType: 'application/pdf',
        extension: 'pdf',
        tracking: trackingNumber,
        carrier,
        sourceHash: shipStationLabelSourceHash(labelId),
        filename: `label-${trackingNumber}.pdf`,
      });
      return stored.document.id;
    },
    markApplied: async (input) => {
      await markShipStationIngestionApplied(orgId, input);
    },
    onError: (shipmentId, error) => {
      console.warn(`[shipstation-label-backfill] shipment ${shipmentId}:`, error instanceof Error ? error.message : error);
    },
    now: () => new Date(),
  };
}
