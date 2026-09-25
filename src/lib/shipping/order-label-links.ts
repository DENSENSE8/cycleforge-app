/**
 * Pairing ShipStation labels with orders — the Link label dialog, the label's
 * support-ticket links, and the order's label list.
 *
 *   list      every label on the order (`shipping_label_purchases`, any
 *             creation type, not unlinked), cost filled from the persisted v1
 *             shipment (`shipstation_shipment_refs`), with its ticket links
 *   search    candidates for Link label: this order's own ShipStation
 *             shipments and every quarantined ShipStation label (empty query),
 *             or a tracking # / ShipStation order # (persisted refs first, a
 *             live v1 lookup only when nothing local matches — an explicit
 *             operator search, never a render)
 *   link      pair one label with this order under a purpose
 *             (`decideLabelLink`); a QUARANTINED ingestion (e.g. the second
 *             live label on one order) resolves as LINKED in the same
 *             transaction; outbound / replacement tracking joins the order's
 *             tracking set (tracking the order already carries is left as
 *             it is), a return's never does
 *   unlink    `decideLabelUnlink`: the row goes `unlinked` (kept, so the
 *             backfill never re-imports it), a LINKED ingestion reopens as
 *             QUARANTINED, tracking the pairing itself added comes off
 *   ticket    the existing ticket ↔ entity waist (`ticket_links`): the order
 *             anchors the ticket when it has no anchor yet, and the label's
 *             tracking is referenced as a SHIPMENT — which is what the support
 *             side's Connections strip already renders
 *
 * Orchestration takes an injectable {@link OrderLabelLinkDeps}; the SQL-backed
 * default lives at the foot of this file.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { applyOrderTrackingOps } from '@/lib/neon/orders-tracking-queries';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { getShipStationV1, getShipStationV2, ShipStationNotConnectedError } from '@/lib/shipping/shipstation/config';
import { ApiError } from '@/lib/api';
import { parseTicketScanValue } from '@/lib/support/ticket-scan';
import {
  addTicketShipmentReference,
  linkTicketToAnchor,
  removeTicketShipmentReference,
} from '@/lib/support/ticket-link';
import {
  decideLabelLink,
  decideLabelUnlink,
  LABEL_PURPOSE_FACE,
  type LabelCreationType,
  type LabelLedgerStatus,
  type LabelLinkFacts,
  type LabelPurpose,
} from '@/lib/shipping/label-purpose';

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface OrderLabelTicket {
  zendeskTicketId: number | null;
  supportTicketId: number | null;
  subject: string | null;
  status: string | null;
}

/** One label on the order, as the Label block lists it. */
export interface OrderLabelEntry {
  id: number;
  status: LabelLedgerStatus;
  purpose: LabelPurpose;
  creationType: LabelCreationType;
  labelId: string | null;
  shipstationShipmentId: number | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  insuranceCost: number | null;
  currency: string | null;
  labelDocumentId: number | null;
  /** Bought / imported / linked at. ISO. */
  at: string | null;
  actor: { id: number; name: string | null } | null;
  tickets: OrderLabelTicket[];
  /** Printable: a stored document, or a ShipStation label the proxy can fetch. */
  printable: boolean;
}

export interface LabelLinkCandidate {
  shipstationShipmentId: number;
  labelId: string;
  orderNumber: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  createDate: string | null;
  voided: boolean;
  isReturnLabel: boolean;
  cost: number | null;
  insuranceCost: number | null;
  /** Where the row came from: persisted refs, the ingestion quarantine, or a live v1 lookup. */
  source: 'shipstation' | 'quarantine' | 'live';
  ingestion: { id: number; state: string; quarantineReason: string | null } | null;
  linkedTo: { orderId: number | null; orderRef: string | null; purpose: LabelPurpose } | null;
}

// ─── Deps ────────────────────────────────────────────────────────────────────

/** The label's resolved facts plus the fields a new ledger row records. */
export interface ResolvedLabel extends LabelLinkFacts {
  shipstationShipmentId: number;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  insuranceCost: number | null;
}

export interface InsertLinkInput {
  orgId: OrgId;
  orderId: number;
  clientEventId: string;
  purpose: LabelPurpose;
  label: ResolvedLabel;
  staffId: number | null;
  /** QUARANTINED ingestion to resolve as LINKED in the same transaction. */
  resolveIngestionId: number | null;
}

export interface UnlinkRow {
  id: number;
  orderId: number;
  status: LabelLedgerStatus;
  purpose: LabelPurpose;
  creationType: LabelCreationType;
  labelIngestionId: number | null;
  ingestionState: string | null;
  shipmentId: number | null;
  trackingNumber: string | null;
  labelId: string | null;
}

export interface OrderLabelLinkDeps {
  /** The order's number (`orders.order_id`); null when not in this org. */
  readOrderRef(orgId: OrgId, orderId: number): Promise<{ orderRef: string | null } | null>;
  /** Everything known about ShipStation shipment `shipmentId`; null = no such label. */
  resolveLabel(orgId: OrgId, shipmentId: number): Promise<ResolvedLabel | null>;
  /** Insert the link row (+ resolve the ingestion). null = lost to a concurrent live row. */
  insertLink(input: InsertLinkInput): Promise<{ id: number } | null>;
  /** The row a prior call under this client key wrote. */
  findByClientEvent(orgId: OrgId, clientEventId: string): Promise<{ id: number; orderId: number | null } | null>;
  /** Add tracking to the order's tracking set (untouched when already there); the STN id, or null. */
  linkTracking(input: { orgId: OrgId; orderId: number; trackingNumber: string }): Promise<number | null>;
  setShipmentId(orgId: OrgId, rowId: number, shipmentId: number): Promise<void>;
  readUnlinkRow(orgId: OrgId, orderId: number, rowId: number): Promise<UnlinkRow | null>;
  /** status → unlinked (+ reopen a LINKED ingestion) in one transaction. */
  markUnlinked(input: { orgId: OrgId; row: UnlinkRow; staffId: number | null; reopenIngestion: boolean }): Promise<void>;
  /** Drop the tracking link the pairing added — never the representative, never pre-existing tracking. */
  unlinkTracking(input: { orgId: OrgId; orderId: number; shipmentId: number }): Promise<void>;
}

// ─── Link ────────────────────────────────────────────────────────────────────

export type LinkOrderLabelResult =
  | { ok: true; rowId: number; idempotent: boolean; purpose: LabelPurpose; label: ResolvedLabel; orderRef: string | null; resolvedIngestionId: number | null; trackingShipmentId: number | null }
  | { ok: false; status: 400 | 404 | 409; code: string; error: string };

export async function linkOrderLabel(
  input: { orgId: OrgId; orderId: number; shipmentId: number; purpose: LabelPurpose; clientEventId: string; staffId: number | null },
  deps: OrderLabelLinkDeps = defaultOrderLabelLinkDeps,
): Promise<LinkOrderLabelResult> {
  const order = await deps.readOrderRef(input.orgId, input.orderId);
  if (!order) return { ok: false, status: 404, code: 'ORDER_NOT_FOUND', error: 'Order not found.' };

  const prior = await deps.findByClientEvent(input.orgId, input.clientEventId);
  const label = await deps.resolveLabel(input.orgId, input.shipmentId);
  if (!label) return { ok: false, status: 404, code: 'LABEL_NOT_FOUND', error: `No ShipStation label se-${input.shipmentId}.` };
  if (prior) {
    if (prior.orderId !== input.orderId) {
      return { ok: false, status: 409, code: 'CLIENT_EVENT_REUSED', error: 'This request key was already used for another order.' };
    }
    return { ok: true, rowId: prior.id, idempotent: true, purpose: input.purpose, label, orderRef: order.orderRef, resolvedIngestionId: null, trackingShipmentId: null };
  }

  const decision = decideLabelLink(input.orderId, input.purpose, label);
  if (decision.kind === 'refuse') return { ok: false, status: decision.status, code: decision.code, error: decision.message };
  if (decision.kind === 'replay') {
    return { ok: true, rowId: decision.rowId, idempotent: true, purpose: input.purpose, label, orderRef: order.orderRef, resolvedIngestionId: null, trackingShipmentId: null };
  }

  const inserted = await deps.insertLink({
    orgId: input.orgId,
    orderId: input.orderId,
    clientEventId: input.clientEventId,
    purpose: decision.purpose,
    label,
    staffId: input.staffId,
    resolveIngestionId: decision.resolveIngestionId,
  });
  if (!inserted) {
    return { ok: false, status: 409, code: 'LABEL_LINK_RACED', error: 'Someone linked this label a moment ago — reopen the order.' };
  }

  let trackingShipmentId: number | null = null;
  if (decision.linkTracking && label.trackingNumber) {
    try {
      trackingShipmentId = await deps.linkTracking({
        orgId: input.orgId,
        orderId: input.orderId,
        trackingNumber: label.trackingNumber,
      });
      if (trackingShipmentId != null) await deps.setShipmentId(input.orgId, inserted.id, trackingShipmentId);
    } catch (error) {
      // The pairing stands; the tracking can be added by hand.
      console.warn('[label-link] tracking link failed', error);
    }
  }
  return {
    ok: true,
    rowId: inserted.id,
    idempotent: false,
    purpose: decision.purpose,
    label,
    orderRef: order.orderRef,
    resolvedIngestionId: decision.resolveIngestionId,
    trackingShipmentId,
  };
}

// ─── Unlink ──────────────────────────────────────────────────────────────────

export type UnlinkOrderLabelResult =
  | { ok: true; idempotent: boolean; row: UnlinkRow; reopenedIngestionId: number | null }
  | { ok: false; status: 404 | 409; code: string; error: string };

export async function unlinkOrderLabel(
  input: { orgId: OrgId; orderId: number; rowId: number; staffId: number | null },
  deps: OrderLabelLinkDeps = defaultOrderLabelLinkDeps,
): Promise<UnlinkOrderLabelResult> {
  const row = await deps.readUnlinkRow(input.orgId, input.orderId, input.rowId);
  if (!row) return { ok: false, status: 404, code: 'LABEL_NOT_FOUND', error: 'That label is not on this order.' };
  const decision = decideLabelUnlink({
    status: row.status,
    creationType: row.creationType,
    purpose: row.purpose,
    ingestionState: row.ingestionState,
  });
  if (decision.kind === 'refuse') return { ok: false, status: decision.status, code: decision.code, error: decision.message };
  if (decision.kind === 'replay') return { ok: true, idempotent: true, row, reopenedIngestionId: null };

  await deps.markUnlinked({ orgId: input.orgId, row, staffId: input.staffId, reopenIngestion: decision.reopenIngestion });
  if (decision.unlinkTracking && row.shipmentId != null) {
    try {
      await deps.unlinkTracking({ orgId: input.orgId, orderId: input.orderId, shipmentId: row.shipmentId });
    } catch (error) {
      console.warn('[label-link] tracking unlink failed', error);
    }
  }
  return {
    ok: true,
    idempotent: false,
    row,
    reopenedIngestionId: decision.reopenIngestion ? row.labelIngestionId : null,
  };
}

/** The order-notes trail line for a link / unlink / purpose buy. */
export function labelTrailNote(
  verb: 'Linked' | 'Unlinked' | 'Bought',
  purpose: LabelPurpose,
  label: { carrierCode: string | null; trackingNumber: string | null; labelId: string | null },
): string {
  const carrier = shipStationCarrierToStored(label.carrierCode) ?? label.carrierCode ?? '';
  const what = [carrier, label.trackingNumber ?? label.labelId ?? ''].filter(Boolean).join(' ');
  return `${verb} ${LABEL_PURPOSE_FACE[purpose].label.toLowerCase()} label${what ? ` · ${what}` : ''}`;
}

// ─── SQL (default deps + reads) ──────────────────────────────────────────────

/** `shipment_links.source` of tracking a label pairing added — what an unlink may take back off. */
const LABEL_LINK_TRACKING_SOURCE = 'orders.label-link';

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type RefRow = {
  shipstation_shipment_id: string | number;
  order_number: string | null;
  tracking_number: string | null;
  carrier_code: string | null;
  service_code: string | null;
  create_date: string | null;
  voided: boolean | null;
  is_return_label: boolean | null;
  shipment_cost: string | number | null;
  insurance_cost: string | number | null;
};

type IngestionRow = {
  id: string | number;
  state: string;
  matched_order_id: number | null;
  tracking_number_raw: string | null;
  carrier: string | null;
  quarantine_reason_code: string | null;
  shipstation_shipment_id: string | number;
  observed_at: Date | string | null;
};

type LiveRow = { id: string | number; order_id: number | null; purpose: LabelPurpose; label_id: string; order_ref: string | null };

async function readRef(orgId: OrgId, shipmentId: number): Promise<RefRow | null> {
  const res = await tenantQuery<RefRow>(
    orgId,
    `SELECT shipstation_shipment_id, order_number, tracking_number, carrier_code, service_code,
            create_date, voided, is_return_label, shipment_cost, insurance_cost
       FROM shipstation_shipment_refs
      WHERE organization_id = $1 AND shipstation_shipment_id = $2
      LIMIT 1`,
    [orgId, shipmentId],
  );
  return res.rows[0] ?? null;
}

async function readLiveRows(orgId: OrgId, labelIds: string[]): Promise<Map<string, LiveRow>> {
  if (labelIds.length === 0) return new Map();
  const res = await tenantQuery<LiveRow>(
    orgId,
    `SELECT lp.id, lp.order_id, lp.purpose, lp.label_id, o.order_id AS order_ref
       FROM shipping_label_purchases lp
       LEFT JOIN orders o ON o.id = lp.order_id AND o.organization_id = lp.organization_id
      WHERE lp.organization_id = $1
        AND lp.label_id = ANY($2::text[])
        AND lp.status IN ('pending', 'purchased')`,
    [orgId, labelIds],
  );
  return new Map(res.rows.map((r) => [r.label_id, r]));
}

async function readIngestions(orgId: OrgId, shipmentIds: number[]): Promise<Map<number, IngestionRow>> {
  if (shipmentIds.length === 0) return new Map();
  const res = await tenantQuery<IngestionRow>(
    orgId,
    `SELECT id, state, matched_order_id, tracking_number_raw, carrier, quarantine_reason_code,
            shipstation_shipment_id, observed_at
       FROM label_ingestions
      WHERE organization_id = $1 AND shipstation_shipment_id = ANY($2::bigint[])`,
    [orgId, shipmentIds],
  );
  return new Map(res.rows.map((r) => [Number(r.shipstation_shipment_id), r]));
}

async function resolveLabelFromSources(orgId: OrgId, shipmentId: number): Promise<ResolvedLabel | null> {
  const labelId = `se-${shipmentId}`;
  const [ref, ingestions, live] = await Promise.all([
    readRef(orgId, shipmentId),
    readIngestions(orgId, [shipmentId]),
    readLiveRows(orgId, [labelId]),
  ]);
  const ingestion = ingestions.get(shipmentId) ?? null;
  const liveRow = live.get(labelId) ?? null;

  // The persisted v1 shipment is the source of truth for voided / return. Not
  // persisted yet (outside the connector's window) → ask ShipStation once:
  // this runs on an explicit Link click, never on a render.
  let voided = ref?.voided === true;
  let isReturnLabel = ref?.is_return_label === true;
  let tracking = ref?.tracking_number ?? ingestion?.tracking_number_raw ?? null;
  let carrierCode = ref?.carrier_code ?? null;
  let serviceCode = ref?.service_code ?? null;
  let cost = num(ref?.shipment_cost);
  if (!ref) {
    try {
      const v2 = await getShipStationV2(orgId);
      const remote = await v2.getLabel(labelId);
      if (!remote && !ingestion) return null;
      if (remote) {
        voided = remote.voided;
        isReturnLabel = remote.isReturnLabel;
        tracking = tracking ?? remote.trackingNumber ?? null;
        carrierCode = remote.carrierCode ?? null;
        serviceCode = remote.serviceCode ?? null;
        cost = remote.cost ?? null;
      }
    } catch (error) {
      if (!ingestion || !(error instanceof ShipStationNotConnectedError)) throw error;
    }
  }
  return {
    labelId,
    shipstationShipmentId: shipmentId,
    voided,
    isReturnLabel,
    trackingNumber: tracking,
    carrierCode: carrierCode ?? ingestion?.carrier ?? null,
    serviceCode,
    cost,
    insuranceCost: num(ref?.insurance_cost),
    ingestion: ingestion
      ? { id: Number(ingestion.id), state: ingestion.state, matchedOrderId: ingestion.matched_order_id }
      : null,
    liveRow: liveRow ? { id: Number(liveRow.id), orderId: liveRow.order_id, purpose: liveRow.purpose } : null,
  };
}

export const defaultOrderLabelLinkDeps: OrderLabelLinkDeps = {
  readOrderRef: async (orgId, orderId) => {
    const res = await tenantQuery<{ order_id: string | null }>(
      orgId,
      `SELECT order_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [orderId, orgId],
    );
    return res.rows[0] ? { orderRef: res.rows[0].order_id } : null;
  },
  resolveLabel: resolveLabelFromSources,
  insertLink: async ({ orgId, orderId, clientEventId, purpose, label, staffId, resolveIngestionId }) =>
    withTenantTransaction(orgId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO shipping_label_purchases
           (organization_id, order_id, client_event_id, status, label_id, tracking_number, carrier_code,
            service_code, cost, insurance_cost, currency, purpose, creation_type, shipstation_shipment_id,
            label_ingestion_id, linked_by, linked_at)
         VALUES ($1, $2, $3, 'purchased', $4, $5, $6, $7, $8, $9, 'USD', $10, 'linked_manually', $11, $12, $13, now())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          orgId, orderId, clientEventId, label.labelId, label.trackingNumber, label.carrierCode,
          label.serviceCode, label.cost, label.insuranceCost, purpose, label.shipstationShipmentId,
          label.ingestion?.id ?? null, staffId,
        ],
      );
      const row = inserted.rows[0];
      if (!row) return null;
      if (resolveIngestionId != null) {
        const resolved = await client.query(
          `UPDATE label_ingestions
              SET state = 'LINKED', matched_order_id = $3, actor_staff_id = $4, row_version = row_version + 1
            WHERE organization_id = $1 AND id = $2 AND state = 'QUARANTINED'`,
          [orgId, resolveIngestionId, orderId, staffId],
        );
        // The quarantine moved under us (retried / promoted) — undo the insert.
        if ((resolved.rowCount ?? 0) === 0) throw new Error(`label ingestion ${resolveIngestionId} is no longer quarantined`);
      }
      return { id: Number(row.id) };
    }),
  findByClientEvent: async (orgId, clientEventId) => {
    const res = await tenantQuery<{ id: string; order_id: number | null }>(
      orgId,
      `SELECT id, order_id FROM shipping_label_purchases
        WHERE organization_id = $1 AND client_event_id = $2 LIMIT 1`,
      [orgId, clientEventId],
    );
    const row = res.rows[0];
    return row ? { id: Number(row.id), orderId: row.order_id } : null;
  },
  linkTracking: async ({ orgId, orderId, trackingNumber }) => {
    // Already on the order (a scanned label, an earlier import): point at its
    // STN row and leave the order's link alone — never re-stamp its box /
    // source, so an unlink can never take it off (see unlinkTracking).
    const owned = await tenantQuery<{ id: string }>(
      orgId,
      `SELECT stn.id FROM shipping_tracking_numbers stn
        WHERE stn.organization_id = $1 AND stn.tracking_number_normalized = $3
          AND (EXISTS (SELECT 1 FROM shipment_links sl
                        WHERE sl.organization_id = $1 AND sl.owner_type = 'ORDER'
                          AND sl.owner_id = $2 AND sl.shipment_id = stn.id)
               OR EXISTS (SELECT 1 FROM orders o
                           WHERE o.organization_id = $1 AND o.id = $2 AND o.shipment_id = stn.id))
        LIMIT 1`,
      [orgId, orderId, normalizeTrackingNumber(trackingNumber)],
    );
    if (owned.rows[0]) return Number(owned.rows[0].id);
    const result = await applyOrderTrackingOps({
      orderIds: [orderId],
      organizationId: orgId,
      creates: [{ trackingNumber, source: LABEL_LINK_TRACKING_SOURCE }],
    });
    return result.createdShipmentIds[0] ?? null;
  },
  setShipmentId: async (orgId, rowId, shipmentId) => {
    await tenantQuery(
      orgId,
      `UPDATE shipping_label_purchases SET shipment_id = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [orgId, rowId, shipmentId],
    );
  },
  readUnlinkRow: async (orgId, orderId, rowId) => {
    const res = await tenantQuery<{
      id: string; order_id: number; status: LabelLedgerStatus; purpose: LabelPurpose; creation_type: LabelCreationType;
      label_ingestion_id: string | null; ingestion_state: string | null; shipment_id: number | null;
      tracking_number: string | null; label_id: string | null;
    }>(
      orgId,
      `SELECT lp.id, lp.order_id, lp.status, lp.purpose, lp.creation_type, lp.label_ingestion_id,
              li.state AS ingestion_state, lp.shipment_id, lp.tracking_number, lp.label_id
         FROM shipping_label_purchases lp
         LEFT JOIN label_ingestions li ON li.id = lp.label_ingestion_id AND li.organization_id = lp.organization_id
        WHERE lp.organization_id = $1 AND lp.order_id = $2 AND lp.id = $3
        LIMIT 1`,
      [orgId, orderId, rowId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      orderId: r.order_id,
      status: r.status,
      purpose: r.purpose,
      creationType: r.creation_type,
      labelIngestionId: r.label_ingestion_id == null ? null : Number(r.label_ingestion_id),
      ingestionState: r.ingestion_state,
      shipmentId: r.shipment_id,
      trackingNumber: r.tracking_number,
      labelId: r.label_id,
    };
  },
  markUnlinked: async ({ orgId, row, staffId, reopenIngestion }) => {
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `UPDATE shipping_label_purchases
            SET status = 'unlinked', unlinked_by = $3, unlinked_at = now(), updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND status IN ('pending', 'purchased')`,
        [orgId, row.id, staffId],
      );
      if (reopenIngestion && row.labelIngestionId != null) {
        await client.query(
          `UPDATE label_ingestions
              SET state = 'QUARANTINED', matched_order_id = NULL, row_version = row_version + 1
            WHERE organization_id = $1 AND id = $2 AND state = 'LINKED'`,
          [orgId, row.labelIngestionId],
        );
      }
    });
  },
  unlinkTracking: async ({ orgId, orderId, shipmentId }) => {
    const res = await tenantQuery<{ shipment_id: number | null; link_source: string | null }>(
      orgId,
      `SELECT o.shipment_id, sl.source AS link_source
         FROM orders o
         LEFT JOIN shipment_links sl
           ON sl.organization_id = o.organization_id AND sl.owner_type = 'ORDER'
          AND sl.owner_id = o.id AND sl.shipment_id = $3
        WHERE o.id = $1 AND o.organization_id = $2
        LIMIT 1`,
      [orderId, orgId, shipmentId],
    );
    const row = res.rows[0];
    // Only the link the pairing itself added comes off — never the order's
    // representative tracking, never tracking the order carried before.
    if (!row || row.shipment_id === shipmentId || row.link_source !== LABEL_LINK_TRACKING_SOURCE) return;
    await applyOrderTrackingOps({ orderIds: [orderId], organizationId: orgId, deletes: [{ shipmentId }] });
  },
};

// ─── Reads ───────────────────────────────────────────────────────────────────

type EntryRow = {
  id: string | number;
  status: LabelLedgerStatus;
  purpose: LabelPurpose;
  creation_type: LabelCreationType;
  label_id: string | null;
  shipstation_shipment_id: string | number | null;
  tracking_number: string | null;
  carrier_code: string | null;
  service_code: string | null;
  cost: string | number | null;
  insurance_cost: string | number | null;
  currency: string | null;
  label_document_id: number | null;
  shipment_id: number | null;
  at: Date | string | null;
  actor_id: number | null;
  actor_name: string | null;
};

type TicketRow = {
  shipment_id: string | number;
  zendesk_ticket_id: string | number | null;
  support_ticket_id: string | number | null;
  subject: string | null;
  status: string | null;
};

/** Every label on the order, oldest first (unlinked rows excluded). */
export async function listOrderLabels(orgId: OrgId, orderId: number): Promise<OrderLabelEntry[]> {
  const res = await tenantQuery<EntryRow>(
    orgId,
    `SELECT lp.id, lp.status, lp.purpose, lp.creation_type, lp.label_id, lp.shipstation_shipment_id,
            lp.tracking_number, lp.carrier_code,
            COALESCE(lp.service_code, ssr.service_code)     AS service_code,
            COALESCE(lp.cost, ssr.shipment_cost)            AS cost,
            -- One source for both: a ledger cost (v2 sums shipment + insurance)
            -- never picks up the v1 row's insurance on top.
            CASE WHEN lp.cost IS NULL THEN ssr.insurance_cost ELSE lp.insurance_cost END AS insurance_cost,
            lp.currency, lp.label_document_id, lp.shipment_id,
            COALESCE(lp.linked_at, lp.created_at)           AS at,
            COALESCE(lp.linked_by, lp.purchased_by)         AS actor_id,
            s.name                                          AS actor_name
       FROM shipping_label_purchases lp
       LEFT JOIN shipstation_shipment_refs ssr
         ON ssr.organization_id = lp.organization_id
        AND ssr.shipstation_shipment_id = lp.shipstation_shipment_id
       LEFT JOIN staff s ON s.id = COALESCE(lp.linked_by, lp.purchased_by)
      WHERE lp.organization_id = $1 AND lp.order_id = $2 AND lp.status <> 'unlinked'
      ORDER BY lp.created_at ASC, lp.id ASC`,
    [orgId, orderId],
  );
  const shipmentIds = [...new Set(res.rows.map((r) => r.shipment_id).filter((v): v is number => v != null))];
  const tickets = new Map<number, OrderLabelTicket[]>();
  if (shipmentIds.length > 0) {
    const t = await tenantQuery<TicketRow>(
      orgId,
      `SELECT tl.entity_id AS shipment_id, tl.zendesk_ticket_id, tl.support_ticket_id,
              st.subject_cache AS subject, st.status_cache AS status
         FROM ticket_links tl
         LEFT JOIN support_tickets st ON st.id = tl.support_ticket_id AND st.organization_id = tl.organization_id
        WHERE tl.organization_id = $1 AND tl.entity_type = 'SHIPMENT' AND tl.entity_id = ANY($2::bigint[])
        ORDER BY tl.created_at ASC`,
      [orgId, shipmentIds],
    );
    for (const row of t.rows) {
      const key = Number(row.shipment_id);
      const list = tickets.get(key) ?? [];
      list.push({
        zendeskTicketId: num(row.zendesk_ticket_id),
        supportTicketId: num(row.support_ticket_id),
        subject: row.subject,
        status: row.status,
      });
      tickets.set(key, list);
    }
  }
  return res.rows.map((r) => ({
    id: Number(r.id),
    status: r.status,
    purpose: r.purpose,
    creationType: r.creation_type,
    labelId: r.label_id,
    shipstationShipmentId: num(r.shipstation_shipment_id),
    trackingNumber: r.tracking_number,
    carrierCode: r.carrier_code,
    serviceCode: r.service_code,
    cost: num(r.cost),
    insuranceCost: num(r.insurance_cost),
    currency: r.currency,
    labelDocumentId: r.label_document_id,
    at: r.at == null ? null : new Date(r.at).toISOString(),
    actor: r.actor_id == null ? null : { id: r.actor_id, name: r.actor_name },
    tickets: r.shipment_id == null ? [] : (tickets.get(r.shipment_id) ?? []),
    printable: r.status !== 'voided' && (r.label_document_id != null || r.label_id != null),
  }));
}

function candidateFromRef(r: RefRow, source: LabelLinkCandidate['source']): LabelLinkCandidate {
  const shipmentId = Number(r.shipstation_shipment_id);
  return {
    shipstationShipmentId: shipmentId,
    labelId: `se-${shipmentId}`,
    orderNumber: r.order_number,
    trackingNumber: r.tracking_number,
    carrierCode: r.carrier_code,
    serviceCode: r.service_code,
    createDate: r.create_date,
    voided: r.voided === true,
    isReturnLabel: r.is_return_label === true,
    cost: num(r.shipment_cost),
    insuranceCost: num(r.insurance_cost),
    source,
    ingestion: null,
    linkedTo: null,
  };
}

const REF_COLUMNS = `shipstation_shipment_id, order_number, tracking_number, carrier_code, service_code,
  create_date, voided, is_return_label, shipment_cost, insurance_cost`;

/**
 * Link-label candidates. Empty query: this order's own ShipStation shipments +
 * every quarantined ShipStation label. Query: an exact tracking # or
 * ShipStation order # — persisted first, a live v1 lookup when nothing local
 * matches.
 */
export async function searchLabelLinkCandidates(
  orgId: OrgId,
  orderId: number,
  query: string | null,
): Promise<{ candidates: LabelLinkCandidate[]; searchedLive: boolean } | null> {
  const orderRes = await tenantQuery<{ order_id: string | null }>(
    orgId,
    `SELECT order_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [orderId, orgId],
  );
  if (!orderRes.rows[0]) return null;
  const orderRef = orderRes.rows[0].order_id?.trim() || null;
  const q = query?.trim() || null;
  const qTracking = q ? normalizeTrackingNumber(q) : null;

  const byShipment = new Map<number, LabelLinkCandidate>();
  const refs = await tenantQuery<RefRow>(
    orgId,
    q
      ? `SELECT ${REF_COLUMNS} FROM shipstation_shipment_refs
          WHERE organization_id = $1
            AND (order_number = $2 OR upper(regexp_replace(COALESCE(tracking_number, ''), '[^A-Za-z0-9]', '', 'g')) = $3)
          ORDER BY create_date DESC NULLS LAST LIMIT 25`
      : `SELECT ${REF_COLUMNS} FROM shipstation_shipment_refs
          WHERE organization_id = $1 AND ($2::text IS NOT NULL AND order_number = $2 OR order_row_id = $3::int)
          ORDER BY create_date DESC NULLS LAST LIMIT 25`,
    q ? [orgId, q, qTracking ?? ''] : [orgId, orderRef, orderId],
  );
  for (const r of refs.rows) byShipment.set(Number(r.shipstation_shipment_id), candidateFromRef(r, 'shipstation'));

  const quarantined = await tenantQuery<IngestionRow>(
    orgId,
    q
      ? `SELECT id, state, matched_order_id, tracking_number_raw, carrier, quarantine_reason_code,
                shipstation_shipment_id, observed_at
           FROM label_ingestions
          WHERE organization_id = $1 AND source = 'SHIPSTATION_API'
            AND state IN ('QUARANTINED', 'LINKED')
            AND tracking_number_normalized = $2
          ORDER BY observed_at DESC LIMIT 25`
      : `SELECT id, state, matched_order_id, tracking_number_raw, carrier, quarantine_reason_code,
                shipstation_shipment_id, observed_at
           FROM label_ingestions
          WHERE organization_id = $1 AND source = 'SHIPSTATION_API' AND state = 'QUARANTINED'
          ORDER BY observed_at DESC LIMIT 25`,
    q ? [orgId, qTracking ?? ''] : [orgId],
  );

  let searchedLive = false;
  if (q && byShipment.size === 0 && quarantined.rows.length === 0) {
    const v1 = await getShipStationV1(orgId);
    if (v1) {
      searchedLive = true;
      const [byTracking, byOrder] = await Promise.all([
        v1.listShipments({ trackingNumber: q, pageSize: 25 }),
        v1.listShipments({ orderNumber: q, pageSize: 25 }),
      ]);
      for (const s of [...byTracking.shipments, ...byOrder.shipments]) {
        byShipment.set(s.shipmentId, {
          shipstationShipmentId: s.shipmentId,
          labelId: `se-${s.shipmentId}`,
          orderNumber: s.orderNumber,
          trackingNumber: s.trackingNumber,
          carrierCode: s.carrierCode,
          serviceCode: s.serviceCode,
          createDate: s.createDate,
          voided: s.voided,
          isReturnLabel: s.isReturnLabel,
          cost: s.shipmentCost,
          insuranceCost: s.insuranceCost,
          source: 'live',
          ingestion: null,
          linkedTo: null,
        });
      }
    }
  }

  // Quarantined rows the refs do not cover yet: build them from the ingestion.
  const missingRefIds = quarantined.rows
    .map((r) => Number(r.shipstation_shipment_id))
    .filter((id) => !byShipment.has(id));
  if (missingRefIds.length > 0) {
    const more = await tenantQuery<RefRow>(
      orgId,
      `SELECT ${REF_COLUMNS} FROM shipstation_shipment_refs
        WHERE organization_id = $1 AND shipstation_shipment_id = ANY($2::bigint[])`,
      [orgId, missingRefIds],
    );
    for (const r of more.rows) byShipment.set(Number(r.shipstation_shipment_id), candidateFromRef(r, 'quarantine'));
    for (const row of quarantined.rows) {
      const id = Number(row.shipstation_shipment_id);
      if (byShipment.has(id)) continue;
      byShipment.set(id, {
        shipstationShipmentId: id,
        labelId: `se-${id}`,
        orderNumber: null,
        trackingNumber: row.tracking_number_raw,
        carrierCode: row.carrier,
        serviceCode: null,
        createDate: row.observed_at == null ? null : new Date(row.observed_at).toISOString(),
        voided: false,
        isReturnLabel: false,
        cost: null,
        insuranceCost: null,
        source: 'quarantine',
        ingestion: null,
        linkedTo: null,
      });
    }
  }

  const ids = [...byShipment.keys()];
  const [ingestions, live] = await Promise.all([
    readIngestions(orgId, ids),
    readLiveRows(orgId, ids.map((id) => `se-${id}`)),
  ]);
  const candidates = [...byShipment.values()].map((c) => {
    const ing = ingestions.get(c.shipstationShipmentId);
    const linked = live.get(c.labelId);
    return {
      ...c,
      ingestion: ing ? { id: Number(ing.id), state: ing.state, quarantineReason: ing.quarantine_reason_code } : null,
      linkedTo: linked ? { orderId: linked.order_id, orderRef: linked.order_ref, purpose: linked.purpose } : null,
    };
  });
  return { candidates, searchedLive };
}

/** What the print proxy needs for one label row. */
export async function readLabelPrintSource(
  orgId: OrgId,
  orderId: number,
  rowId: number,
): Promise<{ labelId: string | null; labelUrl: string | null; labelDocumentId: number | null } | null> {
  const res = await tenantQuery<{ label_id: string | null; label_url: string | null; label_document_id: number | null }>(
    orgId,
    `SELECT label_id, label_url, label_document_id FROM shipping_label_purchases
      WHERE organization_id = $1 AND order_id = $2 AND id = $3 AND status IN ('purchased', 'pending')
      LIMIT 1`,
    [orgId, orderId, rowId],
  );
  const r = res.rows[0];
  return r ? { labelId: r.label_id, labelUrl: r.label_url, labelDocumentId: r.label_document_id } : null;
}

/** The live label row a ticket attaches to (tracking + its STN row, if any). */
async function readLabelForTicket(
  orgId: OrgId,
  orderId: number,
  rowId: number,
): Promise<{ id: number; trackingNumber: string | null; shipmentId: number | null; purpose: LabelPurpose } | null> {
  const res = await tenantQuery<{ id: string; tracking_number: string | null; shipment_id: number | null; purpose: LabelPurpose }>(
    orgId,
    `SELECT id, tracking_number, shipment_id, purpose FROM shipping_label_purchases
      WHERE organization_id = $1 AND order_id = $2 AND id = $3 AND status IN ('purchased', 'voided')
      LIMIT 1`,
    [orgId, orderId, rowId],
  );
  const r = res.rows[0];
  return r ? { id: Number(r.id), trackingNumber: r.tracking_number, shipmentId: r.shipment_id, purpose: r.purpose } : null;
}

// ─── Support tickets ─────────────────────────────────────────────────────────

export type LabelTicketResult =
  | { ok: true; ticketId: number; shipmentId: number; added: boolean; orderAnchored: boolean; purpose: LabelPurpose; trackingNumber: string }
  | { ok: false; status: 400 | 404 | 409; code: string; error: string };

/**
 * Link a label (and its order) to a helpdesk ticket through the existing
 * ticket ↔ entity waist: the ORDER anchors the ticket when the ticket has no
 * anchor yet (a ticket anchored elsewhere keeps it), then the label's tracking
 * is referenced as a SHIPMENT (minting its STN row on demand) — what the
 * ticket's Connections strip renders. Idempotent.
 */
export async function linkLabelToTicket(input: {
  orgId: OrgId;
  orderId: number;
  rowId: number;
  ticket: string;
  staffId: number | null;
}): Promise<LabelTicketResult> {
  const ticketId = parseTicketScanValue(input.ticket);
  if (ticketId == null) return { ok: false, status: 400, code: 'INVALID_TICKET', error: 'A ticket is a number — 48120, or #48120.' };
  const label = await readLabelForTicket(input.orgId, input.orderId, input.rowId);
  if (!label) return { ok: false, status: 404, code: 'LABEL_NOT_FOUND', error: 'That label is not on this order.' };
  if (!label.trackingNumber) {
    return { ok: false, status: 409, code: 'LABEL_NO_TRACKING', error: 'This label has no tracking number to reference.' };
  }

  let orderAnchored = true;
  try {
    await linkTicketToAnchor({
      orgId: input.orgId,
      ticketId,
      anchor: { type: 'order', orderId: input.orderId },
      staffId: input.staffId,
    });
  } catch (error) {
    // Already anchored to another record: the label still becomes a reference.
    if (!(error instanceof ApiError && error.statusCode === 409)) throw error;
    orderAnchored = false;
  }
  const ref = await addTicketShipmentReference({
    orgId: input.orgId,
    ticketId,
    shipmentId: label.shipmentId ?? undefined,
    trackingNumber: label.shipmentId == null ? label.trackingNumber : undefined,
    staffId: input.staffId,
  });
  if (label.shipmentId == null) await defaultOrderLabelLinkDeps.setShipmentId(input.orgId, label.id, ref.shipmentId);
  return {
    ok: true,
    ticketId,
    shipmentId: ref.shipmentId,
    added: ref.added,
    orderAnchored,
    purpose: label.purpose,
    trackingNumber: label.trackingNumber,
  };
}

/** Drop the label's SHIPMENT reference from a ticket (the order anchor stays). */
export async function unlinkLabelFromTicket(input: {
  orgId: OrgId;
  orderId: number;
  rowId: number;
  ticketId: number;
  staffId: number | null;
}): Promise<{ ok: true; removed: boolean; shipmentId: number } | { ok: false; status: 404; code: string; error: string }> {
  const label = await readLabelForTicket(input.orgId, input.orderId, input.rowId);
  if (!label || label.shipmentId == null) {
    return { ok: false, status: 404, code: 'LABEL_NOT_FOUND', error: 'That label has no ticket link on this order.' };
  }
  const result = await removeTicketShipmentReference({
    orgId: input.orgId,
    ticketId: input.ticketId,
    shipmentId: label.shipmentId,
    staffId: input.staffId,
  });
  return { ok: true, removed: result.removed, shipmentId: label.shipmentId };
}
