import 'server-only';
/**
 * File one stored label on one order by hand — the upload tray's and the
 * order slot's one write. It never forks the pairing writers: a typed tracking
 * number or a release goes through `recordOperatorLabelEvidence`, then the
 * ordinary `confirmLabelIngestionOrder` → `applyLabelIngestion` (the operator's
 * collision / existing answers ride into apply's own transaction). A label
 * with no tracking, filed without it, is stored as the order's shipping-label
 * document (`storeOutboundDocumentFromBytes`, as the order upload route does)
 * and its quarantined ingestion removed. A filing that needs an answer the
 * request lacks refuses with the classification, so the client can ask.
 */
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { storeOutboundDocumentFromBytes } from '@/lib/documents/outbound-documents';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { applyLabelIngestion } from './apply';
import {
  classifyLabelFiling,
  filingTracking,
  type LabelFileCheck,
  type LabelFileOnOrderBody,
  type LabelFileOnOrderResult,
  type LabelFileOtherOrder,
  type LabelFilingAnswerRequiredDetail,
  type LabelFilingFacts,
} from './file-on-order-contracts';
import {
  confirmLabelIngestionOrder,
  deleteUnlinkedLabelIngestion,
  readLabelIngestionPdf,
  recordOperatorLabelEvidence,
} from './ingestion-service';
import { serverOrganizationId, type ApplyLabelIngestionInput, type ApplyLabelIngestionResult, type LabelIngestionState } from './types';

type Queryable = Pick<PoolClient, 'query'>;

export class LabelFilingError extends Error {
  constructor(
    readonly status: 404 | 409,
    readonly code: 'INGESTION_NOT_FOUND' | 'INGESTION_NOT_ACTIONABLE' | 'ROW_VERSION_CONFLICT' | 'INGESTION_APPLY_CONFLICT' | 'FILING_ANSWER_REQUIRED',
    message: string,
    /** Set on `FILING_ANSWER_REQUIRED`: what the client must ask. */
    readonly answer: LabelFilingAnswerRequiredDetail | null = null,
  ) {
    super(message);
    this.name = 'LabelFilingError';
  }
}

/** One label, one order, and what filing it there would touch — read in one tenant transaction. */
export interface LabelFilingSnapshot {
  ingestion: { id: number; state: LabelIngestionState; rowVersion: number; matchedOrderId: number | null };
  /** The target order row and every row of its logical order. */
  order: { id: number; orderRef: string; orderIds: number[] };
  facts: LabelFilingFacts;
}

interface FilingQuery {
  orderId: number;
  tracking?: string;
  carrier?: string;
}

async function readSnapshotOn(client: Queryable, organizationId: OrgId, ingestionId: number, query: FilingQuery): Promise<LabelFilingSnapshot> {
  const label = await client.query<{ id: string; state: LabelIngestionState; row_version: number | string; matched_order_id: number | string | null; tracking_number_raw: string | null; tracking_number_normalized: string | null; carrier: string | null }>(
    `SELECT id, state, row_version, matched_order_id, tracking_number_raw, tracking_number_normalized, carrier
       FROM label_ingestions WHERE organization_id=$1 AND id=$2`,
    [organizationId, ingestionId],
  );
  const row = label.rows[0];
  if (!row) throw new LabelFilingError(404, 'INGESTION_NOT_FOUND', 'Label ingestion was not found.');
  const target = await client.query<{ id: number; account_source: string | null; order_id: string | null; status: string | null }>(
    `SELECT id, account_source, order_id, status FROM orders WHERE organization_id=$1 AND id=$2`,
    [organizationId, query.orderId],
  );
  const order = target.rows[0];
  if (!order) throw new LabelFilingError(404, 'INGESTION_NOT_FOUND', 'That order was not found.');
  const logical = order.account_source?.trim() && order.order_id?.trim()
    ? (await client.query<{ id: number }>(
        `SELECT id FROM orders WHERE organization_id=$1 AND account_source=$2 AND order_id=$3 ORDER BY id ASC`,
        [organizationId, order.account_source, order.order_id],
      )).rows.map((entry) => Number(entry.id))
    : [Number(order.id)];
  const orderIds = logical.length > 0 ? logical : [Number(order.id)];

  const owned = await client.query<{ tracking_number_raw: string | null; tracking_number_normalized: string }>(
    `SELECT stn.tracking_number_raw, stn.tracking_number_normalized
       FROM shipping_tracking_numbers stn
      WHERE stn.organization_id = $1
        AND stn.id IN (
          SELECT shipment_id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[]) AND shipment_id IS NOT NULL
          UNION
          SELECT shipment_id FROM shipment_links WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = ANY($2::int[])
        )
      ORDER BY stn.id ASC`,
    [organizationId, orderIds],
  );
  const orderTracking = owned.rows
    .filter((entry) => entry.tracking_number_normalized)
    .map((entry) => ({ raw: entry.tracking_number_raw?.trim() || entry.tracking_number_normalized, normalized: entry.tracking_number_normalized }));

  const tracking = filingTracking(
    { raw: row.tracking_number_raw, normalized: row.tracking_number_normalized, carrier: row.carrier },
    { tracking: query.tracking, carrier: query.carrier },
  );
  const matchedOrderId = row.matched_order_id == null ? null : Number(row.matched_order_id);
  // A label the resolver paired elsewhere (MATCHED, not applied) is that order's until the operator moves it.
  const resolvedElsewhere = row.state === 'MATCHED' && matchedOrderId != null && !orderIds.includes(matchedOrderId) ? matchedOrderId : null;
  let otherOrders: LabelFileOtherOrder[] = [];
  if (tracking) {
    const others = await client.query<{ order_id: number | string; order_number: string; platform: string | null; status: string | null }>(
      `WITH s AS (
         SELECT id FROM shipping_tracking_numbers WHERE organization_id = $1 AND tracking_number_normalized = $2
       ), owners AS (
         SELECT o.id FROM orders o JOIN s ON o.shipment_id = s.id WHERE o.organization_id = $1
         UNION
         SELECT sl.owner_id FROM shipment_links sl JOIN s ON sl.shipment_id = s.id WHERE sl.organization_id = $1 AND sl.owner_type = 'ORDER'
         UNION
         SELECT $4::int WHERE $4::int IS NOT NULL
       )
       SELECT MIN(o.id) AS order_id,
              COALESCE(o.order_id, MIN(o.id)::text) AS order_number,
              o.account_source AS platform,
              (array_agg(o.status ORDER BY o.id))[1] AS status
         FROM orders o JOIN owners ON owners.id = o.id
        WHERE o.organization_id = $1 AND NOT (o.id = ANY($3::int[]))
        GROUP BY o.account_source, o.order_id
        ORDER BY MIN(o.id) ASC`,
      [organizationId, tracking.normalized, orderIds, resolvedElsewhere],
    );
    otherOrders = others.rows.map((entry) => ({ orderId: Number(entry.order_id), orderNumber: entry.order_number, platform: entry.platform, status: entry.status }));
  }

  const orderRef = order.order_id?.trim() || String(order.id);
  return {
    ingestion: { id: Number(row.id), state: row.state, rowVersion: Number(row.row_version), matchedOrderId },
    order: { id: Number(order.id), orderRef, orderIds },
    facts: { tracking, order: { orderId: Number(order.id), orderNumber: orderRef, platform: order.account_source, status: order.status }, otherOrders, orderTracking },
  };
}

/** The label page as the order's shipping-label document — the order upload route's own store — then the quarantined ingestion goes. */
async function storeLabelPageOnOrder(input: { organizationId: OrgId; actorStaffId: number; ingestionId: number; orderId: number; orderRef: string }): Promise<{ documentId: number }> {
  const { bytes, fileBasename } = await readLabelIngestionPdf(input.organizationId, input.ingestionId);
  const fileSha256 = createHash('sha256').update(bytes).digest('hex');
  // The same key a manual upload of these bytes would carry, so either path dedupes the other.
  const sourceHash = createHash('sha256').update(['manual_upload', input.orderId, 'shipping_label', fileSha256].join('|')).digest('hex');
  const stored = await storeOutboundDocumentFromBytes(input.organizationId, {
    orderId: input.orderId,
    orderRef: input.orderRef,
    documentType: 'shipping_label',
    platform: 'manual',
    source: 'manual_upload',
    buffer: bytes,
    contentType: 'application/pdf',
    extension: 'pdf',
    filename: fileBasename,
    uploadedBy: input.actorStaffId,
    sourceHash,
  });
  await deleteUnlinkedLabelIngestion({ organizationId: input.organizationId, actorStaffId: input.actorStaffId, ingestionId: input.ingestionId });
  return { documentId: stored.document.id };
}

export interface FileLabelOnOrderDeps {
  readSnapshot(organizationId: OrgId, ingestionId: number, query: FilingQuery): Promise<LabelFilingSnapshot>;
  recordOperatorEvidence: typeof recordOperatorLabelEvidence;
  confirm: typeof confirmLabelIngestionOrder;
  apply(input: ApplyLabelIngestionInput): Promise<ApplyLabelIngestionResult>;
  storeWithoutTracking: typeof storeLabelPageOnOrder;
}

const defaultDeps: FileLabelOnOrderDeps = {
  readSnapshot: (organizationId, ingestionId, query) => withTenantTransaction(organizationId, (client) => readSnapshotOn(client, organizationId, ingestionId, query)),
  recordOperatorEvidence: recordOperatorLabelEvidence,
  confirm: confirmLabelIngestionOrder,
  apply: (input) => applyLabelIngestion(input),
  storeWithoutTracking: storeLabelPageOnOrder,
};

/** `GET …/file-check` — what filing label `ingestionId` on `orderId` would do, with `tracking` as typed when the page has none. */
export async function readLabelFileCheck(
  organizationId: OrgId,
  ingestionId: number,
  query: { orderId: number; tracking?: string },
  deps: Pick<FileLabelOnOrderDeps, 'readSnapshot'> = defaultDeps,
): Promise<LabelFileCheck> {
  const snapshot = await deps.readSnapshot(organizationId, ingestionId, query);
  return classifyLabelFiling(snapshot.facts).check;
}

/** `POST …/file-on-order` — file the label on the order with the operator's answers (see the module note). */
export async function fileLabelOnOrder(
  input: { organizationId: OrgId; actorStaffId: number; ingestionId: number } & LabelFileOnOrderBody,
  overrides: Partial<FileLabelOnOrderDeps> = {},
): Promise<LabelFileOnOrderResult> {
  const deps = { ...defaultDeps, ...overrides };
  const { organizationId, actorStaffId, ingestionId, orderId } = input;
  const snapshot = await deps.readSnapshot(organizationId, ingestionId, { orderId, tracking: input.tracking, carrier: input.carrier });
  const { ingestion, order } = snapshot;
  const verdict = classifyLabelFiling(snapshot.facts, { withoutTracking: input.withoutTracking, collision: input.collision, existing: input.existing });
  const applyOn = async (expectedRowVersion: number, answers: Pick<ApplyLabelIngestionInput, 'collision' | 'existing'>, repaired: number): Promise<LabelFileOnOrderResult> => {
    const applied = await deps.apply({ organizationId: serverOrganizationId(organizationId), ingestionId, actorStaffId, expectedRowVersion, ...answers });
    if (!applied.ok) throw new LabelFilingError(409, 'INGESTION_APPLY_CONFLICT', applied.message);
    return { mode: 'applied', repaired, documentId: applied.documentId, shipmentId: applied.shipmentId, check: verdict.check };
  };

  if (ingestion.state === 'APPLIED') {
    // Already filed here: the apply replay answers it. Filed elsewhere: only an unpair frees it.
    if (ingestion.matchedOrderId != null && order.orderIds.includes(ingestion.matchedOrderId)) return applyOn(ingestion.rowVersion, {}, 0);
    throw new LabelFilingError(409, 'INGESTION_NOT_ACTIONABLE', 'This label is already filed on another order — unpair it there first.');
  }
  if (ingestion.state !== 'QUARANTINED' && ingestion.state !== 'MATCHED') {
    throw new LabelFilingError(409, 'INGESTION_NOT_ACTIONABLE', 'This label is not ready to file yet.');
  }
  if (ingestion.rowVersion !== input.expectedRowVersion) {
    throw new LabelFilingError(409, 'ROW_VERSION_CONFLICT', 'This label changed. Refresh and try again.');
  }

  const { plan } = verdict;
  switch (plan.kind) {
    case 'ask':
      throw new LabelFilingError(409, 'FILING_ANSWER_REQUIRED', 'This label needs an answer before it can be filed.', { check: verdict.check, needs: plan.needs });
    case 'refuse':
      throw new LabelFilingError(409, 'INGESTION_NOT_ACTIONABLE', plan.message);
    case 'withoutTracking': {
      if (ingestion.state !== 'QUARANTINED' || ingestion.matchedOrderId != null) {
        throw new LabelFilingError(409, 'INGESTION_NOT_ACTIONABLE', 'Only a label still waiting for its order can be filed without tracking.');
      }
      const { documentId } = await deps.storeWithoutTracking({ organizationId, actorStaffId, ingestionId, orderId: order.id, orderRef: order.orderRef });
      return { mode: 'withoutTracking', repaired: 0, documentId, shipmentId: null, check: verdict.check };
    }
    case 'apply': {
      let current: { state: LabelIngestionState; rowVersion: number } = { state: ingestion.state, rowVersion: ingestion.rowVersion };
      const resolvedElsewhere = ingestion.state === 'MATCHED' && (ingestion.matchedOrderId == null || !order.orderIds.includes(ingestion.matchedOrderId));
      if (plan.typed || resolvedElsewhere) {
        const evidenced = await deps.recordOperatorEvidence({
          organizationId,
          actorStaffId,
          ingestionId,
          expectedRowVersion: current.rowVersion,
          tracking: plan.typed ? { raw: plan.typed.raw, carrier: plan.typed.carrier } : null,
          release: resolvedElsewhere,
        });
        current = { state: evidenced.state, rowVersion: evidenced.rowVersion };
      }
      let repaired = 0;
      if (current.state === 'QUARANTINED') {
        const confirmed = await deps.confirm({ organizationId, actorStaffId, ingestionId, orderId: order.id, expectedRowVersion: current.rowVersion });
        current = { state: confirmed.ingestion.state, rowVersion: confirmed.ingestion.rowVersion };
        repaired = confirmed.repaired.length;
      }
      return applyOn(current.rowVersion, { collision: plan.collision ?? undefined, existing: plan.existing ?? undefined }, repaired);
    }
  }
}
