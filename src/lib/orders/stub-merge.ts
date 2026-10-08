/**
 * Stub-order merge — absorb a duplicate order row (the split-brain stub an
 * unmatched ShipStation tracking created) into the real order. The stub's
 * label ledger rows, shipment links, label documents and notes move onto the
 * survivor, then the stub row is deleted. One order id, many labels:
 * `shipment_links` stays the single linkage SoT and `orders.shipment_id` keeps
 * caching the survivor's active label — a moved outbound label re-purposes to
 * `replacement` when the survivor already carries an active label.
 */

import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';

// ─── Facts + decision (pure) ─────────────────────────────────────────────────

/** The stub's active label row, oldest first. */
export interface StubLabelRow {
  rowId: number;
  purpose: LabelPurpose;
  labelDocumentId: number | null;
  shipmentId: number | null;
}

export interface StubMergeFacts {
  stub: { id: number; orderNumber: string | null; shipmentId: number | null } | null;
  target: {
    id: number;
    shipmentId: number | null;
    /** Any non-unlinked label row already on the survivor. */
    hasActiveLabel: boolean;
    /** The survivor's own newest active label's STN — the primary-promotion first choice. */
    newestLabelShipmentId: number | null;
  } | null;
  /** Open (`state <> 'RELEASED'`) `order_unit_allocations` on the stub. */
  openAllocations: number;
  stubLabels: StubLabelRow[];
}

export type StubMergeDecision =
  | {
      kind: 'merge';
      moves: Array<{ rowId: number; purpose: LabelPurpose }>;
      /** The STN to promote when the survivor has no `orders.shipment_id`; null = leave it. */
      promoteShipmentId: number | null;
    }
  | {
      kind: 'refuse';
      status: 400 | 404 | 409;
      code: 'SAME_ORDER' | 'STUB_NOT_FOUND' | 'TARGET_NOT_FOUND' | 'STUB_HAS_ALLOCATIONS' | 'NOTHING_TO_MOVE';
      message: string;
    };

/** May the stub be absorbed into the target, and what moves? */
export function decideStubMerge(facts: StubMergeFacts): StubMergeDecision {
  if (facts.stub != null && facts.target != null && facts.stub.id === facts.target.id) {
    return { kind: 'refuse', status: 400, code: 'SAME_ORDER', message: 'The stub and the surviving order are the same row.' };
  }
  if (facts.stub == null) {
    return { kind: 'refuse', status: 404, code: 'STUB_NOT_FOUND', message: 'The stub order was not found in this organization.' };
  }
  if (facts.target == null) {
    return { kind: 'refuse', status: 404, code: 'TARGET_NOT_FOUND', message: 'The surviving order was not found in this organization.' };
  }
  if (facts.openAllocations > 0) {
    return {
      kind: 'refuse',
      status: 409,
      code: 'STUB_HAS_ALLOCATIONS',
      message: `The stub still holds ${facts.openAllocations} open unit allocation(s) — release them before merging.`,
    };
  }
  if (facts.stubLabels.length === 0) {
    return {
      kind: 'refuse',
      status: 409,
      code: 'NOTHING_TO_MOVE',
      message: 'The stub has no active labels to absorb — delete it instead of merging.',
    };
  }
  const moves = facts.stubLabels.map((label) => ({
    rowId: label.rowId,
    // The survivor already ships under its own label — the stub's outbound
    // label is the second parcel on the order, i.e. a replacement.
    purpose: label.purpose === 'outbound' && facts.target!.hasActiveLabel ? ('replacement' as LabelPurpose) : label.purpose,
  }));
  const promoteShipmentId =
    facts.target.shipmentId == null
      ? (facts.target.newestLabelShipmentId ?? [...facts.stubLabels].reverse().find((l) => l.shipmentId != null)?.shipmentId ?? null)
      : null;
  return { kind: 'merge', moves, promoteShipmentId };
}

/** The order-notes trail line for a merge. */
export function stubMergeNote(stubRef: string | null, movedLabels: number): string {
  const ref = stubRef ?? 'an unnumbered order';
  return `Merged stub order ${ref} into this order — ${movedLabels} label${movedLabels === 1 ? '' : 's'} absorbed.`;
}

// ─── Executor ────────────────────────────────────────────────────────────────

export interface StubMergePlan {
  stubId: number;
  targetId: number;
  moves: Array<{ rowId: number; purpose: LabelPurpose }>;
  promoteShipmentId: number | null;
}

export interface StubMergeApplied {
  movedLabelRows: number;
  movedLabelDocuments: number;
  movedLinks: number;
  movedNotes: number;
  promotedShipmentId: number | null;
}

export interface StubMergeDeps {
  readFacts(orgId: OrgId, stubId: number, targetId: number): Promise<StubMergeFacts>;
  applyMerge(orgId: OrgId, plan: StubMergePlan, staffId: number | null): Promise<StubMergeApplied>;
}

export type StubMergeResult =
  | { ok: true; plan: StubMergePlan; applied: StubMergeApplied; stub: { id: number; orderNumber: string | null } }
  | { ok: false; status: 400 | 404 | 409; code: string; error: string };

/** The single-record write behind `POST /api/orders/merge-stub` — see {@link decideStubMerge}. */
export async function mergeStubOrder(
  input: { orgId: OrgId; stubOrderId: number; targetOrderId: number; staffId: number | null },
  deps: StubMergeDeps = defaultStubMergeDeps,
): Promise<StubMergeResult> {
  const facts = await deps.readFacts(input.orgId, input.stubOrderId, input.targetOrderId);
  const decision = decideStubMerge(facts);
  if (decision.kind === 'refuse') {
    return { ok: false, status: decision.status, code: decision.code, error: decision.message };
  }
  const plan: StubMergePlan = {
    stubId: facts.stub!.id,
    targetId: facts.target!.id,
    moves: decision.moves,
    promoteShipmentId: decision.promoteShipmentId,
  };
  const applied = await deps.applyMerge(input.orgId, plan, input.staffId);
  return {
    ok: true,
    plan,
    applied,
    stub: { id: facts.stub!.id, orderNumber: facts.stub!.orderNumber },
  };
}

// ─── SQL (default deps) ──────────────────────────────────────────────────────

type OrderPairRow = { id: number | string; order_id: string | null; shipment_id: string | number | null };
type TargetLabelFactsRow = { has_active: boolean; newest_shipment: string | number | null };
type StubLabelSqlRow = {
  id: number | string;
  purpose: string;
  label_document_id: number | string | null;
  shipment_id: number | string | null;
};

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function readFacts(orgId: OrgId, stubId: number, targetId: number): Promise<StubMergeFacts> {
  const orders = await tenantQuery<OrderPairRow>(
    orgId,
    `SELECT id, order_id, shipment_id FROM orders
      WHERE organization_id = $1 AND id = ANY($2::int[])`,
    [orgId, [stubId, targetId]],
  );
  const stubRow = orders.rows.find((r) => Number(r.id) === stubId) ?? null;
  const targetRow = orders.rows.find((r) => Number(r.id) === targetId) ?? null;

  const [allocations, targetLabels, stubLabels] = await Promise.all([
    // order_unit_allocations has no organization_id — order_id is the org-scoped key.
    tenantQuery<{ n: number }>(
      orgId,
      `SELECT count(*)::int AS n FROM order_unit_allocations
        WHERE order_id = $1 AND state <> 'RELEASED'`,
      [stubId],
    ),
    tenantQuery<TargetLabelFactsRow>(
      orgId,
      `SELECT EXISTS (
         SELECT 1 FROM shipping_label_purchases
          WHERE organization_id = $1 AND order_id = $2 AND status <> 'unlinked'
       ) AS has_active,
       (SELECT shipment_id FROM shipping_label_purchases
          WHERE organization_id = $1 AND order_id = $2 AND status <> 'unlinked' AND shipment_id IS NOT NULL
          ORDER BY created_at DESC, id DESC LIMIT 1) AS newest_shipment`,
      [orgId, targetId],
    ),
    tenantQuery<StubLabelSqlRow>(
      orgId,
      `SELECT id, purpose, label_document_id, shipment_id FROM shipping_label_purchases
        WHERE organization_id = $1 AND order_id = $2 AND status <> 'unlinked'
        ORDER BY created_at ASC, id ASC`,
      [orgId, stubId],
    ),
  ]);

  return {
    stub: stubRow ? { id: Number(stubRow.id), orderNumber: stubRow.order_id, shipmentId: num(stubRow.shipment_id) } : null,
    target: targetRow
      ? {
          id: Number(targetRow.id),
          shipmentId: num(targetRow.shipment_id),
          hasActiveLabel: targetLabels.rows[0]?.has_active === true,
          newestLabelShipmentId: num(targetLabels.rows[0]?.newest_shipment ?? null),
        }
      : null,
    openAllocations: Number(allocations.rows[0]?.n ?? 0),
    stubLabels: stubLabels.rows.map((r) => ({
      rowId: Number(r.id),
      purpose: (r.purpose as LabelPurpose) ?? 'outbound',
      labelDocumentId: num(r.label_document_id),
      shipmentId: num(r.shipment_id),
    })),
  };
}

async function applyMerge(orgId: OrgId, plan: StubMergePlan, staffId: number | null): Promise<StubMergeApplied> {
  return withTenantTransaction<StubMergeApplied>(orgId, async (client) => {
    // 1. Label ledger rows → the survivor, re-purposed per the plan.
    const labels = await client.query<{ label_document_id: number | null }>(
      `UPDATE shipping_label_purchases lp
          SET order_id = $3, purpose = m.purpose
         FROM unnest($4::int[], $5::text[]) AS m(row_id, purpose)
        WHERE lp.organization_id = $2 AND lp.id = m.row_id AND lp.status <> 'unlinked'
        RETURNING lp.label_document_id`,
      [orgId, orgId, plan.targetId, plan.moves.map((m) => m.rowId), plan.moves.map((m) => m.purpose)],
    );
    const docIds = labels.rows
      .map((r) => (r.label_document_id == null ? null : Number(r.label_document_id)))
      .filter((v): v is number => v != null);

    // 2. Their label documents re-anchor to the survivor BEFORE the stub delete
    //    — the order-delete trigger would otherwise take the PDFs with it.
    let movedLabelDocuments = 0;
    if (docIds.length > 0) {
      const docs = await client.query(
        `UPDATE documents SET entity_id = $3
          WHERE organization_id = $2 AND id = ANY($4::int[]) AND entity_id = $1`,
        [plan.stubId, orgId, plan.targetId, docIds],
      );
      movedLabelDocuments = docs.rowCount ?? 0;
    }

    // 3. Shipment links: owner moves to the survivor (never primary — the
    //    survivor keeps its own active label); a link the survivor already
    //    holds just refreshes instead of double-inserting.
    await client.query(
      `INSERT INTO shipment_links
         (organization_id, owner_type, owner_id, shipment_id, box_seq, is_primary, direction, role, source, linked_by, linked_at, metadata)
       SELECT organization_id, owner_type, $3, shipment_id, box_seq, false, direction, role, 'orders.merge-stub', $4, linked_at, metadata
         FROM shipment_links
        WHERE organization_id = $2 AND owner_type = 'ORDER' AND owner_id = $1
       ON CONFLICT (organization_id, owner_type, owner_id, shipment_id) DO UPDATE SET updated_at = now()`,
      [plan.stubId, orgId, plan.targetId, staffId],
    );
    const links = await client.query(
      `DELETE FROM shipment_links
        WHERE organization_id = $2 AND owner_type = 'ORDER' AND owner_id = $1`,
      [plan.stubId, orgId],
    );

    // 4. The survivor's notes trail keeps the stub's operator context.
    const notes = await client.query(
      `UPDATE order_notes SET order_id = $3
        WHERE organization_id = $2 AND order_id = $1`,
      [plan.stubId, orgId, plan.targetId],
    );

    // 5. A survivor with no primary label adopts one (its own newest first,
    //    else the newest absorbed label) so `orders.shipment_id` never dangles.
    let promotedShipmentId: number | null = null;
    if (plan.promoteShipmentId != null) {
      await client.query(
        `UPDATE shipment_links SET is_primary = false, updated_at = now()
          WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = $2 AND is_primary`,
        [orgId, plan.targetId],
      );
      await client.query(
        `UPDATE shipment_links SET is_primary = true, updated_at = now()
          WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = $2 AND shipment_id = $3`,
        [orgId, plan.targetId, plan.promoteShipmentId],
      );
      await client.query(
        `UPDATE orders SET shipment_id = $3 WHERE organization_id = $2 AND id = $1`,
        [plan.targetId, orgId, plan.promoteShipmentId],
      );
      promotedShipmentId = plan.promoteShipmentId;
    }

    // 6. The stub row goes — remaining children (refs, flags, placements, its
    //    own slip documents) are covered by the cascade/trigger set.
    await client.query(`DELETE FROM orders WHERE organization_id = $2 AND id = $1`, [plan.stubId, orgId]);

    return {
      movedLabelRows: labels.rowCount ?? 0,
      movedLabelDocuments,
      movedLinks: links.rowCount ?? 0,
      movedNotes: notes.rowCount ?? 0,
      promotedShipmentId,
    };
  });
}

const defaultStubMergeDeps: StubMergeDeps = { readFacts, applyMerge };
