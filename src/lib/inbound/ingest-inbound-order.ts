/**
 * ingestInboundOrder — the ONE writer that lands an inbound order on the
 * Incoming spine, for every source (the purchase-order form, CSV import,
 * marketplace / Zoho sync, auto-replenish, a repair ticket's drop-off).
 *
 * One order = one transaction: the `inbound_order` header, every line
 * (`ingestPurchase` on the same client, keyed by line_key), the carton +
 * tracking links, the carton classifiers, the listing evidence unbox checks
 * against (bought-as grade → `receiving_line.purchase_condition_grade` and the
 * grade picker; listing serials → `receiving_line_listing_serial`), a
 * RETURN's facts (`receiving_line_return` + carton return classifiers), and
 * the ledger row all commit or none do. A failure is recorded in the ledger
 * on its own connection so it stays visible (and retryable) after the
 * rollback. Listing photos are not in the draft: the form uploads them
 * against the landed `receiving_line` ids (`photo_type = 'listing'`).
 *
 * Also here: the dry-run preview the form's outcome panel and a CSV staging
 * pass read, and the guarded delete for an order entered by mistake.
 */

import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import { writeLineFact } from '@/lib/receiving/facts/store';
import { ensureReceivingForInboundOrder } from '@/lib/receiving/attach-box';
import { normalizeSerial } from '@/lib/neon/serial-units-queries';
import { ingestPurchase, type IngestPurchaseDeps } from './ingest-purchase';
import { tagInboundReturnInTx } from './tag-inbound-return';
import { upsertInboundMirror } from './mirror';
import { upsertPurchaseLink, type TxClient } from './purchase-links';
import { recordEquivalence } from './equivalence';
import { matchZohoPo, type MergeMatchReason } from './purchase-match';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';
import {
  assignInboundLineKeys,
  canonicalInboundTracking,
  filledInboundLines,
  inboundOrderDraftSchema,
  inboundOrderFingerprint,
  inboundOrderIdentity,
  inboundOrderMissing,
  inboundOrderMissingSentence,
  INBOUND_PRIORITY_AUTO,
  type InboundOrderDraft,
  type InboundOrderIdentity,
  type InboundOrderNeed,
  type InboundOrderLine,
} from './inbound-order-draft';

export type InboundOrderOrigin = 'manual' | 'csv' | 'sync' | 'auto_replenish' | 'backfill';

/** Ledger source of the one writer allowed to land a REPAIR drop-off: the repair ticket itself. */
export const REPAIR_DROP_OFF_SOURCE = 'repair_intake';

export class InboundOrderRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly missing: InboundOrderNeed[] = [],
  ) {
    super(message);
  }
}

export interface IngestInboundOrderContext {
  origin: InboundOrderOrigin;
  /** Ledger source: 'form' · 'csv' · 'zoho' · 'ebay' · 'amazon' · 'replenish' · 'repair_intake'. */
  source: string;
  staffId: number | null;
  /** The source's idempotency handle; defaults to the order identity + content hash. */
  sourceEventId?: string | null;
  batchId?: number | null;
  replenishmentRequestId?: string | null;
}

export interface IngestedInboundLine {
  lineKey: string;
  receivingLineId: number;
  created: boolean;
}

export interface IngestInboundOrderResult {
  inboundOrderId: number;
  created: boolean;
  /** Same content as the last landing — nothing was written. */
  unchanged: boolean;
  identity: InboundOrderIdentity;
  lines: IngestedInboundLine[];
  receivingId: number | null;
  /** Receiving/Sales pickup projection created by the same transaction. */
  localPickupOrderId: number | null;
  /** An eBay order that IS a Zoho PO on the spine: linked to its lines, no line of its own minted. */
  attachedTo?: { zohoPurchaseOrderId: string; reason: MergeMatchReason };
}

/** One query surface for the tx client and the tenant pool (preview / ledger-failure paths). */
type Query = <T extends QueryResultRow = QueryResultRow>(text: string, params?: ReadonlyArray<unknown>) => Promise<{ rows: T[] }>;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseDraft(raw: unknown, returnClaim: boolean): InboundOrderDraft {
  const parsed = inboundOrderDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'draft'}: ${i.message}`).join('; ');
    throw new InboundOrderRefused(`invalid inbound order — ${detail}`, 400);
  }
  const missing = inboundOrderMissing(parsed.data, { returnClaim });
  if (missing.length > 0) throw new InboundOrderRefused(inboundOrderMissingSentence(missing), 400, missing);
  return parsed.data;
}

interface CatalogHit {
  id: number;
  sku: string;
  title: string;
}

/** Exact, org-scoped, active catalog row — by id when picked, else by the typed SKU. */
async function resolveLineCatalog(query: Query, orgId: OrgId, skuCatalogId: number | null, sku: string): Promise<CatalogHit | null> {
  if (skuCatalogId == null && !sku.trim()) return null;
  const r = await query<{ id: number; sku: string; product_title: string }>(
    skuCatalogId != null
      ? `SELECT id, sku, product_title FROM sku_catalog
          WHERE organization_id = $1 AND id = $2 AND is_active = true LIMIT 1`
      : `SELECT id, sku, product_title FROM sku_catalog
          WHERE organization_id = $1 AND lower(sku) = lower($2) AND is_active = true
          ORDER BY id LIMIT 1`,
    [orgId, skuCatalogId ?? sku.trim()],
  );
  const row = r.rows[0];
  if (!row && skuCatalogId != null) throw new InboundOrderRefused(`Catalog item ${skuCatalogId} is not an active catalog row`, 400);
  return row ? { id: Number(row.id), sku: row.sku, title: row.product_title } : null;
}

/** Find-or-create the vendor in the org's own supplier master. */
async function resolveSupplierId(query: Query, orgId: OrgId, vendor: string): Promise<number | null> {
  const name = vendor.trim();
  if (!name) return null;
  const r = await query<{ id: number }>(
    `INSERT INTO suppliers (organization_id, name, supplier_type)
     VALUES ($1, $2, 'other')
     ON CONFLICT (organization_id, (lower(btrim(name)))) DO UPDATE SET updated_at = suppliers.updated_at
     RETURNING id`,
    [orgId, name],
  );
  return Number(r.rows[0].id);
}

async function recordLedger(
  query: Query,
  orgId: OrgId,
  args: {
    ctx: IngestInboundOrderContext;
    sourceEventId: string;
    payload: unknown;
    payloadHash: string;
    status: 'landed' | 'unchanged' | 'failed' | 'valid' | 'invalid';
    inboundOrderId: number | null;
    outcome: unknown;
    error: string | null;
  },
): Promise<void> {
  await query(
    `INSERT INTO inbound_ingest_event (
       organization_id, batch_id, origin, source, source_event_id, payload, payload_hash,
       status, outcome, error, attempts, inbound_order_id, landed_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, 1, $11,
               CASE WHEN $8 IN ('landed', 'unchanged') THEN now() END)
     ON CONFLICT (organization_id, source, source_event_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       payload_hash = EXCLUDED.payload_hash,
       status = CASE WHEN EXCLUDED.status = 'failed' AND inbound_ingest_event.attempts + 1 >= 5
                     THEN 'dead' ELSE EXCLUDED.status END,
       outcome = EXCLUDED.outcome,
       error = EXCLUDED.error,
       attempts = inbound_ingest_event.attempts + 1,
       batch_id = COALESCE(EXCLUDED.batch_id, inbound_ingest_event.batch_id),
       inbound_order_id = COALESCE(EXCLUDED.inbound_order_id, inbound_ingest_event.inbound_order_id),
       landed_at = COALESCE(EXCLUDED.landed_at, inbound_ingest_event.landed_at),
       updated_at = now()`,
    [
      orgId,
      args.ctx.batchId ?? null,
      args.ctx.origin,
      args.ctx.source,
      args.sourceEventId,
      JSON.stringify(args.payload),
      args.payloadHash,
      args.status,
      args.outcome == null ? null : JSON.stringify(args.outcome),
      args.error,
      args.inboundOrderId,
    ],
  );
}

export interface IngestInboundOrderDeps {
  ingestPurchase: typeof ingestPurchase;
  registerShipment: (trackingNumber: string, sourceSystem: string, orgId: OrgId) => Promise<number | null>;
  upsertPurchaseLink: typeof upsertPurchaseLink;
  recordEquivalence: typeof recordEquivalence;
}

const defaultDeps: IngestInboundOrderDeps = {
  ingestPurchase,
  registerShipment: async (trackingNumber, sourceSystem, orgId) =>
    (await registerShipmentPermissive({ trackingNumber, sourceSystem }, orgId))?.id ?? null,
  upsertPurchaseLink,
  recordEquivalence,
};

interface ZohoTwinLine {
  id: number;
  receiving_id: number | null;
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  tracking: string | null;
}

/** The Zoho PO an eBay buyer order already IS on the spine, and that PO's lines (id order). */
export interface ZohoTwin {
  zohoPurchaseOrderId: string;
  reason: MergeMatchReason;
  lines: ZohoTwinLine[];
}

/**
 * Find the Zoho PO this eBay order is (`matchZohoPo`): candidates by the PO#
 * index (`zoho_purchaseorder_number_norm` = the eBay order id) or a carton
 * on one of the order's tracking numbers; the shared rule decides. Null when
 * not eBay, when this order already has lines of its own (a twin landed
 * before this writer existed — the repair retires it, never this writer), or
 * when the order matches more than one PO (ambiguous — it lands as itself).
 */
export async function findZohoTwin(
  query: Query,
  orgId: OrgId,
  identity: InboundOrderIdentity,
  tracking: readonly { number: string }[],
  inboundOrderId: number,
): Promise<ZohoTwin | null> {
  if (identity.sourceType !== 'ebay') return null;
  const own = await query(
    `SELECT 1 FROM receiving_line WHERE organization_id = $1 AND inbound_order_id = $2 LIMIT 1`,
    [orgId, inboundOrderId],
  );
  if (own.rows.length > 0) return null;
  const candidates = await query<ZohoTwinLine>(
    `WITH cand AS (
       SELECT rz.receiving_line_id AS id
         FROM receiving_line_zoho rz
        WHERE rz.organization_id = $1 AND rz.zoho_purchaseorder_number_norm = $2
       UNION
       SELECT rl.id
         FROM shipping_tracking_numbers stn
         JOIN receiving_carton rc ON rc.organization_id = $1 AND rc.shipment_id = stn.id
         JOIN receiving_line rl ON rl.organization_id = $1 AND rl.receiving_id = rc.id
        WHERE stn.tracking_number_normalized = ANY($3::text[])
     )
     SELECT rl.id, rl.receiving_id, rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number,
            stn.tracking_number_raw AS tracking
       FROM cand
       JOIN receiving_line rl ON rl.id = cand.id AND rl.organization_id = $1
       JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        AND rz.zoho_purchaseorder_id IS NOT NULL
       LEFT JOIN receiving_carton rc ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
      WHERE COALESCE(rl.inbound_source_type, 'zoho') <> 'ebay'
      ORDER BY rl.id`,
    [orgId, canonicalizeTrackingKey(identity.externalOrderId), tracking.map((t) => t.number)],
  );
  const byPo = new Map<string, ZohoTwin>();
  for (const row of candidates.rows) {
    const po = { zohoPurchaseOrderId: row.zoho_purchaseorder_id, poNumber: row.zoho_purchaseorder_number, tracking: row.tracking };
    const asks = tracking.length > 0 ? tracking.map((t) => t.number) : [null];
    const reason = asks
      .map((number) => matchZohoPo({ receivingLineId: 0, sourceOrderId: identity.externalOrderId, sku: null, tracking: number }, po))
      .find((r) => r != null);
    if (!reason) continue;
    const twin = byPo.get(row.zoho_purchaseorder_id);
    if (twin) {
      twin.lines.push(row);
      if (reason === 'tracking') twin.reason = 'tracking';
    } else {
      byPo.set(row.zoho_purchaseorder_id, { zohoPurchaseOrderId: row.zoho_purchaseorder_id, reason, lines: [row] });
    }
  }
  return byPo.size === 1 ? [...byPo.values()][0]! : null;
}

const SHIPMENT_SOURCE: Record<string, string> = { ebay: 'ebay_purchase', amazon: 'amazon_purchase', manual: 'manual_inbound' };

/**
 * What the listing said, onto each landed line: the bought-as grade and the
 * listing's serials. An operator landing (form, CSV) is the truth: its grade
 * (null clears) and serial list replace what is stored. A machine landing
 * (sync, replenish, backfill) only fills — its blank grade and missing
 * serials never erase what an operator typed. A field the draft leaves out
 * (`undefined`) is always left as stored. Serials sync by normalized value:
 * new ones are inserted (first seen now), kept ones keep their
 * `first_seen_at`, and removed ones are deleted only while unbox has not
 * confirmed them. Lines that resolve to the same receiving line (a Zoho
 * twin's lead line) merge their evidence.
 */
async function landListingEvidence(
  query: Query,
  orgId: OrgId,
  lines: readonly InboundOrderLine[],
  landed: readonly IngestedInboundLine[],
  origin: InboundOrderOrigin,
): Promise<void> {
  const operator = origin === 'manual' || origin === 'csv';
  const byLine = new Map<number, { grade: InboundOrderLine['conditionGrade']; serials: Map<string, string> | null }>();
  for (const [i, line] of lines.entries()) {
    const receivingLineId = landed[i]?.receivingLineId;
    if (receivingLineId == null) continue;
    const entry = byLine.get(receivingLineId) ?? { grade: undefined, serials: null };
    if (entry.grade == null && (operator || line.conditionGrade != null)) entry.grade = line.conditionGrade;
    if (line.listingSerials !== undefined) {
      entry.serials ??= new Map();
      for (const raw of line.listingSerials) {
        const norm = normalizeSerial(raw);
        if (norm && !entry.serials.has(norm)) entry.serials.set(norm, raw.trim());
      }
    }
    byLine.set(receivingLineId, entry);
  }

  // `receiving_line_listing_serial.source`: who first said the listing shows this serial.
  const source = origin === 'csv' ? 'csv' : origin === 'manual' ? 'form' : 'sync';
  for (const [receivingLineId, { grade, serials }] of byLine) {
    if (grade !== undefined) {
      await query(
        `UPDATE receiving_line
            SET purchase_condition_grade = $3::condition_grade_enum, updated_at = NOW()
          WHERE organization_id = $1 AND id = $2
            AND purchase_condition_grade IS DISTINCT FROM $3::condition_grade_enum`,
        [orgId, receivingLineId, grade],
      );
    }
    if (serials) {
      const norms = [...serials.keys()];
      if (operator) {
        await query(
          `DELETE FROM receiving_line_listing_serial
            WHERE organization_id = $1 AND receiving_line_id = $2
              AND confirmed_at IS NULL AND NOT (serial_norm = ANY($3::text[]))`,
          [orgId, receivingLineId, norms],
        );
      }
      if (norms.length > 0) {
        await query(
          `INSERT INTO receiving_line_listing_serial (organization_id, receiving_line_id, serial, serial_norm, source)
           SELECT $1, $2, s.serial, s.serial_norm, $5
             FROM unnest($3::text[], $4::text[]) AS s(serial_norm, serial)
           ON CONFLICT (organization_id, receiving_line_id, serial_norm) DO UPDATE
             SET serial = EXCLUDED.serial, updated_at = NOW()
             WHERE receiving_line_listing_serial.serial IS DISTINCT FROM EXCLUDED.serial`,
          [orgId, receivingLineId, norms, [...serials.values()], source],
        );
      }
    }
  }
}

/**
 * Pickup is authored once as an inbound order, then projected into the legacy
 * local-pickup read model consumed by Receiving and Sales. This runs on the
 * same transaction as the inbound spine, so neither display can see a partial
 * document import.
 */
async function projectLocalPickup(
  query: Query,
  orgId: OrgId,
  draft: InboundOrderDraft,
  inboundOrderId: number,
  receivingId: number | null,
  lines: ReturnType<typeof filledInboundLines>,
  keys: string[],
  resolved: Array<CatalogHit | null>,
  landed: readonly IngestedInboundLine[],
  staffId: number | null,
): Promise<number | null> {
  if (draft.type !== 'PICKUP') return null;

  const header = await query<{ id: number }>(
    `INSERT INTO local_pickup_orders (
       inbound_order_id, pickup_date, customer_name, notes, created_by, status,
       organization_id, receiving_id, payment_method, paid_amount_cents
     ) VALUES ($1, $2::date, NULLIF($3, ''), NULLIF($4, ''), $5, 'DRAFT', $6, $7, NULLIF($8, ''), $9)
     ON CONFLICT (organization_id, inbound_order_id) WHERE inbound_order_id IS NOT NULL DO UPDATE SET
       pickup_date = EXCLUDED.pickup_date,
       customer_name = EXCLUDED.customer_name,
       notes = EXCLUDED.notes,
       receiving_id = COALESCE(EXCLUDED.receiving_id, local_pickup_orders.receiving_id),
       payment_method = EXCLUDED.payment_method,
       paid_amount_cents = EXCLUDED.paid_amount_cents,
       updated_at = NOW()
     RETURNING id`,
    [
      inboundOrderId,
      draft.orderDate,
      draft.vendor.trim(),
      draft.notes.trim(),
      staffId,
      orgId,
      receivingId,
      draft.pickup?.paymentMethod.trim().toUpperCase() ?? '',
      draft.pickup?.paidCents ?? null,
    ],
  );
  const pickupOrderId = Number(header.rows[0].id);

  for (const [index, line] of lines.entries()) {
    const hit = resolved[index];
    const quantity = line.quantity ?? 1;
    const totalCents = line.unitCostCents == null ? 0 : line.unitCostCents * quantity;
    await query(
      `INSERT INTO local_pickup_order_items (
         order_id, inbound_line_key, receiving_id, receiving_line_id, sku, product_title, quantity,
         condition_grade, parts_status, missing_parts_note, condition_note,
         total_price, organization_id
       ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9, NULLIF($10, ''), NULLIF($11, ''), $12::numeric / 100, $13)
       ON CONFLICT (organization_id, order_id, inbound_line_key) WHERE inbound_line_key IS NOT NULL DO UPDATE SET
         receiving_id = COALESCE(EXCLUDED.receiving_id, local_pickup_order_items.receiving_id),
         receiving_line_id = COALESCE(EXCLUDED.receiving_line_id, local_pickup_order_items.receiving_line_id),
         sku = EXCLUDED.sku,
         product_title = EXCLUDED.product_title,
         quantity = EXCLUDED.quantity,
         condition_grade = EXCLUDED.condition_grade,
         parts_status = EXCLUDED.parts_status,
         missing_parts_note = EXCLUDED.missing_parts_note,
         condition_note = EXCLUDED.condition_note,
         total_price = EXCLUDED.total_price,
         updated_at = NOW()`,
      [
        pickupOrderId,
        keys[index],
        receivingId,
        landed[index]?.receivingLineId ?? null,
        hit?.sku ?? line.sku.trim(),
        line.title.trim() || hit?.title || '',
        quantity,
        line.conditionGrade ?? null,
        line.partsStatus ?? null,
        line.missingPartsNote?.trim() ?? '',
        line.conditionNote?.trim() ?? '',
        totalCents,
        orgId,
      ],
    );
  }
  return pickupOrderId;
}

/**
 * A repair drop-off is in hand the moment the ticket is written: it gets its
 * own carton (the `R-{id}` Receiving and Cmd-K show), leaves Incoming (the
 * line is MATCHED, never EXPECTED), and carries every repair signal the
 * Receiving surfaces read — carton and line `intake_type = 'repair'`,
 * `is_repair_service`, and the `repair_service` line fact naming the ticket.
 */
async function projectRepairDropOff(
  client: TxClient,
  orgId: OrgId,
  draft: InboundOrderDraft,
  identity: InboundOrderIdentity,
  inboundOrderId: number,
  landed: readonly IngestedInboundLine[],
): Promise<number | null> {
  if (draft.type !== 'REPAIR') return null;

  const receivingId = await ensureReceivingForInboundOrder({
    sourceType: 'manual',
    sourceOrderId: identity.externalOrderId,
    organizationId: orgId,
    inboundOrderId,
    db: client as unknown as Parameters<typeof ensureReceivingForInboundOrder>[0]['db'],
  });
  await client.query(
    `UPDATE receiving_carton
        SET intake_type = 'repair',
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [receivingId, orgId],
  );
  const lineIds = landed.map((l) => l.receivingLineId);
  await client.query(
    `UPDATE receiving_line
        SET receiving_id = $1,
            intake_type = 'repair',
            is_repair_service = TRUE,
            workflow_status = CASE WHEN workflow_status = 'EXPECTED'
                                   THEN 'MATCHED'::inbound_workflow_status_enum
                                   ELSE workflow_status END,
            updated_at = NOW()
      WHERE organization_id = $2 AND id = ANY($3::int[])`,
    [receivingId, orgId, lineIds],
  );
  const factDeps = {
    query: ((_org: OrgId, sql: string, params?: unknown[]) => client.query(sql, params)) as typeof tenantQuery,
  };
  for (const lineId of lineIds) {
    await writeLineFact(orgId, lineId, 'repair_service', { isRepairService: true, ticketRef: identity.externalOrderId }, factDeps);
  }
  return receivingId;
}

/**
 * Land one order on the caller's transaction client. Refusals throw
 * `InboundOrderRefused`; the caller's transaction rolls back on any throw.
 */
export async function ingestInboundOrderInTx(
  client: TxClient,
  orgId: OrgId,
  rawDraft: unknown,
  ctx: IngestInboundOrderContext,
  deps: IngestInboundOrderDeps = defaultDeps,
): Promise<IngestInboundOrderResult> {
  // Only the hand-entered return files a claim ticket, so only it needs the claim's facts.
  const draft = parseDraft(rawDraft, ctx.origin === 'manual');
  const query: Query = <T extends QueryResultRow>(sql: string, params?: ReadonlyArray<unknown>) => client.query<T>(sql, params);
  const identity = inboundOrderIdentity(draft);
  if (identity.sourceType === 'zoho' && ctx.origin !== 'sync') {
    throw new InboundOrderRefused('Zoho orders arrive by sync, not by hand', 400);
  }
  if (draft.type === 'REPAIR' && (ctx.source !== REPAIR_DROP_OFF_SOURCE || identity.sourceType !== 'manual')) {
    throw new InboundOrderRefused('A repair drop-off lands from its repair ticket, not by hand', 400);
  }
  const fingerprint = inboundOrderFingerprint(draft);
  const contentHash = sha256(fingerprint);
  const sourceEventId =
    ctx.sourceEventId?.trim() ||
    `${identity.sourceType}:${identity.sourcePlatform}:${identity.externalOrderIdNorm}:${contentHash.slice(0, 16)}`;

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `inbound-order:${orgId}:${identity.sourceType}:${identity.sourcePlatform}:${identity.externalOrderIdNorm}`,
  ]);

  const prior = await query<{ id: number; content_hash: string | null }>(
    `SELECT id, content_hash FROM inbound_order
      WHERE organization_id = $1 AND source_type = $2 AND source_platform = $3 AND external_order_id_norm = $4
      FOR UPDATE`,
    [orgId, identity.sourceType, identity.sourcePlatform, identity.externalOrderIdNorm],
  );
  if (prior.rows[0] && prior.rows[0].content_hash === contentHash) {
    const lines = await query<{ id: number; line_key: string; receiving_id: number | null }>(
      `SELECT id, line_key, receiving_id FROM receiving_line
        WHERE organization_id = $1 AND inbound_order_id = $2 ORDER BY id`,
      [orgId, prior.rows[0].id],
    );
    const pickup = draft.type === 'PICKUP'
      ? await query<{ id: number }>(
          `SELECT id FROM local_pickup_orders
            WHERE organization_id = $1 AND inbound_order_id = $2
            ORDER BY id LIMIT 1`,
          [orgId, prior.rows[0].id],
        )
      : { rows: [] };
    const result: IngestInboundOrderResult = {
      inboundOrderId: Number(prior.rows[0].id),
      created: false,
      unchanged: true,
      identity,
      lines: lines.rows.map((l) => ({ lineKey: l.line_key, receivingLineId: Number(l.id), created: false })),
      receivingId: lines.rows.find((l) => l.receiving_id != null)?.receiving_id ?? null,
      localPickupOrderId: pickup.rows[0] ? Number(pickup.rows[0].id) : null,
    };
    await recordLedger(query, orgId, {
      ctx, sourceEventId, payload: draft, payloadHash: contentHash, status: 'unchanged',
      inboundOrderId: result.inboundOrderId, outcome: { unchanged: true }, error: null,
    });
    return result;
  }

  const supplierId = await resolveSupplierId(query, orgId, draft.vendor);
  const priorityTier = draft.priority === INBOUND_PRIORITY_AUTO ? null : Number(draft.priority);
  const header = await query<{ id: number; created: boolean }>(
    `INSERT INTO inbound_order (
       organization_id, source_type, source_platform, external_order_id, external_order_id_norm,
       order_number, receiving_type, origin, supplier_id, vendor_name, currency, order_date,
       expected_date, priority_tier, notes, content_hash, created_by, replenishment_request_id
     ) VALUES ($1, $2, $3, $4, inbound_order_number_norm($4), $4, $5, $6, $7, NULLIF($8, ''), $9,
               $10::date, $11::date, $12, NULLIF($13, ''), $14, $15, $16::uuid)
     ON CONFLICT (organization_id, source_type, source_platform, external_order_id_norm) DO UPDATE SET
       receiving_type = EXCLUDED.receiving_type,
       supplier_id = COALESCE(EXCLUDED.supplier_id, inbound_order.supplier_id),
       vendor_name = COALESCE(EXCLUDED.vendor_name, inbound_order.vendor_name),
       currency = EXCLUDED.currency,
       order_date = COALESCE(EXCLUDED.order_date, inbound_order.order_date),
       expected_date = COALESCE(EXCLUDED.expected_date, inbound_order.expected_date),
       priority_tier = EXCLUDED.priority_tier,
       notes = COALESCE(EXCLUDED.notes, inbound_order.notes),
       content_hash = EXCLUDED.content_hash,
       replenishment_request_id = COALESCE(EXCLUDED.replenishment_request_id, inbound_order.replenishment_request_id),
       updated_at = now()
     RETURNING id, (xmax = 0) AS created`,
    [
      orgId,
      identity.sourceType,
      identity.sourcePlatform,
      identity.externalOrderId,
      draft.type,
      ctx.origin,
      supplierId,
      draft.vendor.trim(),
      draft.currency.toUpperCase(),
      draft.orderDate,
      draft.expectedDate,
      priorityTier,
      draft.notes.trim(),
      contentHash,
      ctx.staffId,
      ctx.replenishmentRequestId ?? null,
    ],
  );
  const inboundOrderId = Number(header.rows[0].id);

  const lines = filledInboundLines(draft);
  const keys = assignInboundLineKeys(lines);
  const tracking = canonicalInboundTracking(draft);
  const [firstTracking, ...moreTracking] = tracking;
  const ingestDeps: IngestPurchaseDeps = {
    withTx: (_o, fn) => fn(client),
    upsertPurchaseLink,
    upsertInboundMirror,
    upsertReceivingLineTesting,
  };
  const resolved = await Promise.all(
    lines.map((line) => resolveLineCatalog(query, orgId, line.skuCatalogId, line.sku)),
  );
  const mirrorLines = lines.map((line, i) => ({
    lineKey: keys[i],
    sku: resolved[i]?.sku ?? (line.sku.trim() || null),
    title: line.title.trim() || resolved[i]?.title || null,
    skuCatalogId: resolved[i]?.id ?? null,
    quantity: line.quantity,
    unitCostCents: line.unitCostCents,
    listingUrl: line.listingUrl.trim() || null,
    itemNumber: line.itemNumber.trim() || null,
  }));
  const shared = {
    sourceType: identity.sourceType,
    sourceOrderId: identity.externalOrderId,
    accountLabel: draft.accountName.trim() || null,
    sellerUsername: draft.vendor.trim() || null,
    orderNumber: identity.externalOrderId,
    vendorOrSellerName: draft.vendor.trim() || null,
    status: draft.sourceStatus?.order.trim() || 'ISSUED',
    purchaseOrderStatus: draft.sourceStatus?.order.trim() || null,
    paymentStatus: draft.sourceStatus?.payment.trim() || null,
    poDate: draft.orderDate,
    expectedDeliveryDate: draft.expectedDate,
    lineItems: mirrorLines,
    rawPayload: { via: `inbound-order:${ctx.origin}`, inboundOrderId, currency: draft.currency, notes: draft.notes || null },
    inboundOrderId,
    receivingType: draft.type,
    currency: draft.currency.toUpperCase(),
    // Hand / CSV re-saves correct a line's identity; syncs only fill blanks.
    operatorResave: ctx.origin === 'manual' || ctx.origin === 'csv',
  };

  // One purchase = one spine line: an eBay buyer order that IS a Zoho PO
  // already on the spine (`matchZohoPo` — the eBay ↔ Zoho merge's rule) links
  // to that PO's lines instead of minting a twin line + carton. The merge
  // (`mergeEbayLinesIntoZohoPo`) covers the other order of arrival. The
  // listing evidence still lands on the PO's lines; return facts do not (a
  // Zoho PO line is a purchase, never a return).
  const twin = await findZohoTwin(query, orgId, identity, tracking, inboundOrderId);
  if (twin) {
    await upsertInboundMirror(
      orgId,
      {
        sourceType: identity.sourceType,
        sourceOrderId: identity.externalOrderId,
        orderNumber: identity.externalOrderId,
        vendorOrSellerName: shared.vendorOrSellerName,
        status: shared.status,
        paymentStatus: shared.paymentStatus,
        poDate: draft.orderDate,
        expectedDeliveryDate: draft.expectedDate,
        trackingNumber: firstTracking?.number ?? null,
        carrierCode: firstTracking?.carrier || null,
        lineItems: mirrorLines,
        rawPayload: shared.rawPayload,
      },
      { query: (async (_o: OrgId, sql: string, params?: ReadonlyArray<unknown>) => client.query(sql, params)) as never },
    );
    // Positional when the order and the PO carry the same number of lines; else every line names the PO's lead line.
    const attached: IngestedInboundLine[] = keys.map((lineKey, i) => ({
      lineKey,
      receivingLineId: (keys.length === twin.lines.length ? twin.lines[i]! : twin.lines[0]!).id,
      created: false,
    }));
    for (const line of attached) {
      await deps.upsertPurchaseLink(
        orgId,
        {
          receivingLineId: line.receivingLineId,
          sourceType: identity.sourceType,
          sourceOrderId: identity.externalOrderId,
          sourceLineItemId: line.lineKey,
          isPrimary: false,
        },
        { withTx: (_o, fn) => fn(client) },
      );
    }
    await landListingEvidence(query, orgId, lines, attached, ctx.origin);
    await deps.recordEquivalence(
      orgId,
      {
        sourceTypeA: identity.sourceType,
        sourceOrderIdA: identity.externalOrderId,
        sourceTypeB: 'zoho',
        sourceOrderIdB: twin.zohoPurchaseOrderId,
        linkReason: twin.reason,
      },
      { query: (async (_o: OrgId, sql: string, params?: ReadonlyArray<unknown>) => client.query(sql, params)) as never },
    );
    const result: IngestInboundOrderResult = {
      inboundOrderId,
      created: Boolean(header.rows[0].created),
      unchanged: false,
      identity,
      lines: attached,
      receivingId: twin.lines.find((l) => l.receiving_id != null)?.receiving_id ?? null,
      localPickupOrderId: null,
      attachedTo: { zohoPurchaseOrderId: twin.zohoPurchaseOrderId, reason: twin.reason },
    };
    await recordLedger(query, orgId, {
      ctx, sourceEventId, payload: draft, payloadHash: contentHash, status: 'landed',
      inboundOrderId, outcome: { attachedTo: result.attachedTo, lines: attached }, error: null,
    });
    return result;
  }

  // Every tracking number is registered ONCE, before any line touches its
  // shipment row inside this transaction (see IngestPurchaseInput.shipmentId).
  const shipmentIds = new Map<string, number | null>();
  const shipmentSource = SHIPMENT_SOURCE[identity.sourceType];
  if (shipmentSource) {
    for (const t of tracking) shipmentIds.set(t.number, await deps.registerShipment(t.number, shipmentSource, orgId));
  }

  const landed: IngestedInboundLine[] = [];
  let receivingId: number | null = null;
  for (const [i, line] of lines.entries()) {
    const hit = resolved[i];
    const r = await deps.ingestPurchase(
      orgId,
      {
        ...shared,
        sourceLineItemId: keys[i],
        lineKey: keys[i],
        sku: hit?.sku ?? (line.sku.trim() || null),
        itemName: line.title.trim() || hit?.title || null,
        skuCatalogId: hit?.id ?? null,
        quantityExpected: line.quantity ?? 1,
        conditionGrade: line.conditionGrade ?? undefined,
        unitCostCents: line.unitCostCents,
        listingUrl: line.listingUrl.trim() || null,
        trackingNumber: firstTracking?.number ?? null,
        carrierCode: firstTracking?.carrier || null,
        shipmentId: firstTracking ? shipmentIds.get(firstTracking.number) ?? null : null,
      },
      ingestDeps,
    );
    landed.push({ lineKey: keys[i], receivingLineId: r.receivingLineId, created: r.created });
    receivingId ??= r.receivingId;
  }
  // A split shipment: every further tracking number anchors on the same carton.
  for (const t of moreTracking) {
    const r = await deps.ingestPurchase(
      orgId,
      {
        ...shared,
        sourceLineItemId: keys[0],
        lineKey: keys[0],
        sku: mirrorLines[0].sku,
        itemName: mirrorLines[0].title,
        skuCatalogId: mirrorLines[0].skuCatalogId,
        quantityExpected: lines[0].quantity ?? 1,
        unitCostCents: lines[0].unitCostCents,
        trackingNumber: t.number,
        carrierCode: t.carrier || null,
        shipmentId: shipmentIds.get(t.number) ?? null,
      },
      ingestDeps,
    );
    receivingId ??= r.receivingId;
  }

  await landListingEvidence(query, orgId, lines, landed, ctx.origin);

  // Carton-level classifiers (the Incoming paint + priority), on this transaction.
  if (identity.paintPlatform || priorityTier != null) {
    await query(
      `UPDATE receiving_carton rc
          SET source_platform = COALESCE($1, rc.source_platform),
              priority_tier = COALESCE($2, rc.priority_tier),
              updated_at = NOW()
        WHERE rc.organization_id = $3
          AND rc.id IN (SELECT rl.receiving_id FROM receiving_line rl
                         WHERE rl.organization_id = $3 AND rl.inbound_order_id = $4 AND rl.receiving_id IS NOT NULL)`,
      [identity.paintPlatform, priorityTier, orgId, inboundOrderId],
    );
  }

  if (draft.type === 'RETURN') {
    // An operator landing states the return; a machine landing only fills what it carries.
    const operator = ctx.origin === 'manual' || ctx.origin === 'csv';
    const said = (value: string | undefined) => (value === undefined ? undefined : value.trim() || (operator ? null : undefined));
    for (const [i, line] of lines.entries()) {
      // A return report's row may carry its own reason / RMA / request date; blank = the order's.
      const requestedOn = line.returnRequestDate || draft.returnRequestDate;
      await tagInboundReturnInTx(client, orgId, {
        receivingLineId: landed[i]!.receivingLineId,
        sourceType: identity.sourceType,
        sourceOrderId: identity.externalOrderId,
        returnReason: said(line.returnReason?.trim() || draft.returnReason),
        rmaRef: said(line.rmaId?.trim() || draft.rmaId),
        fnsku: said(line.fnsku),
        licensePlateNumber: said(line.licensePlateNumber),
        disposition: said(line.disposition),
        customerComment: said(line.customerComment),
        returnRequestedOn: requestedOn == null && !operator ? undefined : requestedOn,
      });
    }
  }

  receivingId = (await projectRepairDropOff(client, orgId, draft, identity, inboundOrderId, landed)) ?? receivingId;

  const localPickupOrderId = await projectLocalPickup(
    query,
    orgId,
    draft,
    inboundOrderId,
    receivingId,
    lines,
    keys,
    resolved,
    landed,
    ctx.staffId,
  );

  const result: IngestInboundOrderResult = {
    inboundOrderId,
    created: Boolean(header.rows[0].created),
    unchanged: false,
    identity,
    lines: landed,
    receivingId,
    localPickupOrderId,
  };
  await recordLedger(query, orgId, {
    ctx, sourceEventId, payload: draft, payloadHash: contentHash, status: 'landed',
    inboundOrderId, outcome: { created: result.created, lines: landed.length, receivingId }, error: null,
  });
  return result;
}

/**
 * Own-transaction entry point. A thrown ingest rolls the order back, then the
 * failure is written to the ledger on a separate connection so it is never
 * silent; the error is rethrown for the caller to map.
 */
export async function ingestInboundOrder(
  orgId: OrgId,
  rawDraft: unknown,
  ctx: IngestInboundOrderContext,
  deps: IngestInboundOrderDeps = defaultDeps,
): Promise<IngestInboundOrderResult> {
  try {
    return await withTenantTransaction(orgId, (client) =>
      ingestInboundOrderInTx(client as unknown as TxClient, orgId, rawDraft, ctx, deps),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ingest failed';
    const payload = rawDraft ?? {};
    const payloadHash = sha256(JSON.stringify(payload));
    const parsed = inboundOrderDraftSchema.safeParse(rawDraft);
    const identity = parsed.success ? inboundOrderIdentity(parsed.data) : null;
    const sourceEventId =
      ctx.sourceEventId?.trim() ||
      (identity
        ? `${identity.sourceType}:${identity.sourcePlatform}:${identity.externalOrderIdNorm}:${payloadHash.slice(0, 16)}`
        : `unparsed:${payloadHash.slice(0, 32)}`);
    await recordLedger(
      <T extends QueryResultRow>(sql: string, params?: ReadonlyArray<unknown>) => tenantQuery<T>(orgId, sql, params),
      orgId,
      {
        ctx, sourceEventId, payload, payloadHash,
        status: err instanceof InboundOrderRefused ? 'invalid' : 'failed',
        inboundOrderId: null, outcome: null, error: message,
      },
    ).catch((ledgerErr) => console.error('[inbound] ledger write failed', ledgerErr));
    throw err;
  }
}

// ─── dry run ─────────────────────────────────────────────────────────────────

export interface InboundOrderPreviewLine {
  index: number;
  lineKey: string;
  action: 'create' | 'update';
  catalog: CatalogHit | null;
}

export interface InboundOrderPreview {
  missing: InboundOrderNeed[];
  identity: InboundOrderIdentity | null;
  existing: { inboundOrderId: number; status: string; origin: string; lineCount: number; receivedLines: number } | null;
  lines: InboundOrderPreviewLine[];
  /** Existing lines of this order the draft no longer lists (kept, not deleted). */
  untouchedLineKeys: string[];
  /** The same order number under another source / platform. */
  sameNumberElsewhere: Array<{ inboundOrderId: number; sourceType: string; sourcePlatform: string }>;
  tracking: Array<{ number: string; carrier: string; cartonId: number | null; otherOrder: string | null }>;
  unchanged: boolean;
}

/** Read-only: what landing this draft would do. Never writes. */
export async function previewInboundOrder(
  orgId: OrgId,
  rawDraft: unknown,
  opts: { returnClaim?: boolean } = {},
): Promise<InboundOrderPreview> {
  const parsed = inboundOrderDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw new InboundOrderRefused(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  }
  const draft = parsed.data;
  const q: Query = <T extends QueryResultRow>(sql: string, params?: ReadonlyArray<unknown>) => tenantQuery<T>(orgId, sql, params);
  const missing = inboundOrderMissing(draft, opts);
  const identity = draft.orderNumber.trim() && draft.platform.trim() ? inboundOrderIdentity(draft) : null;
  const lines = filledInboundLines(draft);
  const keys = assignInboundLineKeys(lines);
  const indexes = draft.lines.flatMap((l, i) => (lines.includes(l) ? [i] : []));

  const existingRow = identity
    ? (
        await q<{ id: number; status: string; origin: string; content_hash: string | null; line_count: number; received: number }>(
          `SELECT io.id, io.status, io.origin, io.content_hash,
                  count(rl.id)::int AS line_count,
                  count(rl.id) FILTER (WHERE COALESCE(rl.quantity_received, 0) > 0)::int AS received
             FROM inbound_order io
             LEFT JOIN receiving_line rl ON rl.inbound_order_id = io.id AND rl.organization_id = io.organization_id
            WHERE io.organization_id = $1 AND io.source_type = $2 AND io.source_platform = $3
              AND io.external_order_id_norm = $4
            GROUP BY io.id`,
          [orgId, identity.sourceType, identity.sourcePlatform, identity.externalOrderIdNorm],
        )
      ).rows[0] ?? null
    : null;
  const existingKeys = existingRow
    ? (
        await q<{ line_key: string }>(
          `SELECT line_key FROM receiving_line WHERE organization_id = $1 AND inbound_order_id = $2`,
          [orgId, existingRow.id],
        )
      ).rows.map((r) => r.line_key)
    : [];

  const catalogs = await Promise.all(
    lines.map((line) => resolveLineCatalog(q, orgId, line.skuCatalogId, line.sku).catch(() => null)),
  );

  const elsewhere = identity
    ? (
        await q<{ id: number; source_type: string; source_platform: string }>(
          `SELECT id, source_type, source_platform FROM inbound_order
            WHERE organization_id = $1 AND external_order_id_norm = $2
              AND NOT (source_type = $3 AND source_platform = $4)
            ORDER BY id LIMIT 5`,
          [orgId, identity.externalOrderIdNorm, identity.sourceType, identity.sourcePlatform],
        )
      ).rows.map((r) => ({ inboundOrderId: Number(r.id), sourceType: r.source_type, sourcePlatform: r.source_platform }))
    : [];

  const tracking = await Promise.all(
    canonicalInboundTracking(draft).map(async (t) => {
      const hit = (
        await q<{ carton_id: number | null; order_number: string | null; inbound_order_id: number | null }>(
          `SELECT rc.id AS carton_id, io.order_number, io.id AS inbound_order_id
             FROM shipping_tracking_numbers stn
             JOIN receiving_carton rc ON rc.shipment_id = stn.id AND rc.organization_id = $1
             LEFT JOIN receiving_line rl ON rl.receiving_id = rc.id AND rl.organization_id = rc.organization_id
             LEFT JOIN inbound_order io ON io.id = rl.inbound_order_id
            WHERE stn.tracking_number_normalized = $2
            ORDER BY rc.id LIMIT 1`,
          [orgId, t.number],
        )
      ).rows[0];
      const sameOrder = hit?.inbound_order_id != null && existingRow && Number(hit.inbound_order_id) === Number(existingRow.id);
      return {
        number: t.number,
        carrier: t.carrier,
        cartonId: hit?.carton_id != null ? Number(hit.carton_id) : null,
        otherOrder: hit && !sameOrder ? (hit.order_number ?? `carton ${hit.carton_id}`) : null,
      };
    }),
  );

  return {
    missing,
    identity,
    existing: existingRow
      ? {
          inboundOrderId: Number(existingRow.id),
          status: existingRow.status,
          origin: existingRow.origin,
          lineCount: existingRow.line_count,
          receivedLines: existingRow.received,
        }
      : null,
    lines: lines.map((_, i) => ({
      index: indexes[i],
      lineKey: keys[i],
      action: existingKeys.includes(keys[i]) ? 'update' : 'create',
      catalog: catalogs[i],
    })),
    untouchedLineKeys: existingKeys.filter((k) => !keys.includes(k)),
    sameNumberElsewhere: elsewhere,
    tracking,
    unchanged: Boolean(existingRow?.content_hash && missing.length === 0 && existingRow.content_hash === sha256(inboundOrderFingerprint(draft))),
  };
}

// ─── guarded delete ──────────────────────────────────────────────────────────

export interface DeleteInboundOrderResult {
  inboundOrderId: number;
  deletedLineIds: number[];
  deletedCartonIds: number[];
  orderDeleted: boolean;
}

/**
 * What happened to a spine line that deleting it would erase (null = nothing):
 * units counted, unit facts (a serial / waiver / grade on a unit slot — an
 * empty slot is only the line having been opened), serials, tests, inventory
 * events, an exception or claim, putaway, a return, a pickup or repair tie.
 * Alias `rl`. Every reference that CASCADEs or SET NULLs off receiving_line.
 */
export const INBOUND_LINE_HISTORY_SQL = `CASE
                WHEN COALESCE(rl.quantity_received, 0) > 0 THEN 'units received'
                WHEN EXISTS (SELECT 1 FROM receiving_line_unit u WHERE u.receiving_line_id = rl.id
                               AND (u.serial_unit_id IS NOT NULL OR u.serial_absent OR u.condition_grade IS NOT NULL)) THEN 'unit facts recorded'
                WHEN EXISTS (SELECT 1 FROM tech_serial_numbers t WHERE t.receiving_line_id = rl.id) THEN 'serials attached'
                WHEN EXISTS (SELECT 1 FROM testing_results t WHERE t.receiving_line_id = rl.id) THEN 'test results recorded'
                WHEN EXISTS (SELECT 1 FROM inventory_events e WHERE e.receiving_line_id = rl.id) THEN 'inventory moved'
                WHEN EXISTS (SELECT 1 FROM receiving_exceptions x WHERE x.receiving_line_id = rl.id) THEN 'exception recorded'
                WHEN EXISTS (SELECT 1 FROM receiving_claim_seller_messages m WHERE m.receiving_line_id = rl.id) THEN 'claim messages'
                WHEN EXISTS (SELECT 1 FROM receiving_line_putaway p WHERE p.receiving_line_id = rl.id) THEN 'put away'
                WHEN EXISTS (SELECT 1 FROM receiving_line_return r WHERE r.receiving_line_id = rl.id) THEN 'return recorded'
                WHEN EXISTS (SELECT 1 FROM local_pickup_order_items i WHERE i.receiving_line_id = rl.id) THEN 'pickup item'
                WHEN EXISTS (SELECT 1 FROM repair_service s WHERE s.receiving_line_id = rl.id) THEN 'repair ticket'
              END`;

/**
 * Why a spine line may not be deleted by hand (null = nothing physical happened
 * to it): a door / unbox / receive stamp, any unit slot, or its history
 * ({@link INBOUND_LINE_HISTORY_SQL}). Alias `rl`.
 */
export const INBOUND_LINE_DELETE_BLOCKER_SQL = `CASE
                WHEN rl.scanned_at IS NOT NULL OR rl.unboxed_at IS NOT NULL OR rl.received_at IS NOT NULL
                  OR rl.received_done_at IS NOT NULL THEN 'already scanned at the door'
                WHEN EXISTS (SELECT 1 FROM receiving_line_unit u WHERE u.receiving_line_id = rl.id) THEN 'units attached'
                ELSE ${INBOUND_LINE_HISTORY_SQL}
              END`;

/**
 * Delete spine lines already cleared by {@link INBOUND_LINE_DELETE_BLOCKER_SQL}
 * (or, for a duplicate whose purchase another line keeps, {@link INBOUND_LINE_HISTORY_SQL}),
 * with their dependents; then each of `cartonIds` that ends up empty and was
 * never door-scanned / unboxed. Returns the cartons deleted. On the caller's tx.
 */
export async function deleteInboundLinesInTx(
  client: Pick<TxClient, 'query'>,
  orgId: OrgId,
  lineIds: readonly number[],
  cartonIds: readonly number[],
): Promise<number[]> {
  if (lineIds.length > 0) {
    // Dependents without ON DELETE CASCADE.
    await client.query(`DELETE FROM receiving_listing_links WHERE organization_id = $1 AND receiving_line_id = ANY($2::int[])`, [orgId, lineIds]);
    await client.query(
      `UPDATE shortage_inbound_links SET receiving_line_id = NULL, link_status = 'released', updated_at = now()
        WHERE organization_id = $1 AND receiving_line_id = ANY($2::int[])`,
      [orgId, lineIds],
    );
    await client.query(`UPDATE inbound_purchase_merge_log SET loser_line_id = NULL WHERE organization_id = $1 AND loser_line_id = ANY($2::int[])`, [orgId, lineIds]);
    await client.query(
      `DELETE FROM shipment_links WHERE organization_id = $1 AND owner_type = 'RECEIVING_LINE' AND owner_id = ANY($2::int[])`,
      [orgId, lineIds],
    );
    await client.query(`DELETE FROM receiving_line WHERE organization_id = $1 AND id = ANY($2::int[])`, [orgId, lineIds]);
  }
  const deletedCartons: number[] = [];
  for (const cartonId of cartonIds) {
    const gone = await client.query<{ id: number }>(
      `DELETE FROM receiving_carton rc
        WHERE rc.organization_id = $1 AND rc.id = $2
          AND NOT EXISTS (SELECT 1 FROM receiving_line rl WHERE rl.receiving_id = rc.id)
          AND NOT EXISTS (SELECT 1 FROM receiving_scans s WHERE s.receiving_id = rc.id)
          AND NOT EXISTS (SELECT 1 FROM receiving_unbox u WHERE u.receiving_id = rc.id)
          AND NOT EXISTS (SELECT 1 FROM receiving_triage t
                           WHERE t.receiving_id = rc.id AND t.door_received_at IS NOT NULL)
          -- Carton history that would CASCADE away with it.
          AND NOT EXISTS (SELECT 1 FROM receiving_exceptions x WHERE x.receiving_id = rc.id)
          AND NOT EXISTS (SELECT 1 FROM receiving_claim_seller_messages m WHERE m.receiving_id = rc.id)
          AND NOT EXISTS (SELECT 1 FROM local_pickup_items i WHERE i.receiving_id = rc.id)
        RETURNING id`,
      [orgId, cartonId],
    );
    if (gone.rows[0]) {
      deletedCartons.push(cartonId);
      await client.query(
        `DELETE FROM shipment_links WHERE organization_id = $1 AND owner_type = 'RECEIVING' AND owner_id = $2`,
        [orgId, cartonId],
      );
    }
  }
  return deletedCartons;
}

/**
 * Delete an order entered by mistake — only while nothing about it is
 * physical: no quantity received, no scan / unbox / receive stamp, no units,
 * tests or inventory events on any line. Cartons the order minted go with it
 * when they end up empty and were never door-scanned.
 */
export async function deleteInboundOrder(orgId: OrgId, inboundOrderId: number): Promise<DeleteInboundOrderResult> {
  return withTenantTransaction(orgId, async (client) => {
    const order = await client.query<{ id: number }>(
      `SELECT id FROM inbound_order WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, inboundOrderId],
    );
    if (!order.rows[0]) throw new InboundOrderRefused(`Inbound order ${inboundOrderId} not found`, 404);

    const lines = await client.query<{ id: number; receiving_id: number | null; blocker: string | null }>(
      `SELECT rl.id, rl.receiving_id,
              ${INBOUND_LINE_DELETE_BLOCKER_SQL} AS blocker
         FROM receiving_line rl
        WHERE rl.organization_id = $1 AND rl.inbound_order_id = $2
        FOR UPDATE OF rl`,
      [orgId, inboundOrderId],
    );
    const blocked = lines.rows.filter((l) => l.blocker);
    if (blocked.length > 0) {
      throw new InboundOrderRefused(
        `Cannot delete — ${blocked.map((l) => `line ${l.id}: ${l.blocker}`).join('; ')}`,
        409,
      );
    }
    const lineIds = lines.rows.map((l) => Number(l.id));
    const cartonIds = [...new Set(lines.rows.flatMap((l) => (l.receiving_id != null ? [Number(l.receiving_id)] : [])))];
    const deletedCartons = await deleteInboundLinesInTx(client as unknown as TxClient, orgId, lineIds, cartonIds);

    await deleteInboundOrderShellInTx(client as unknown as TxClient, orgId, inboundOrderId);
    return { inboundOrderId, deletedLineIds: lineIds, deletedCartonIds: deletedCartons, orderDeleted: true };
  });
}

/**
 * Remove an inbound order whose lines are already gone, on the caller's tx:
 * its mirror (when no purchase link still names it), a note on its ingest
 * ledger rows, then the header.
 */
export async function deleteInboundOrderShellInTx(
  client: Pick<TxClient, 'query'>,
  orgId: OrgId,
  inboundOrderId: number,
): Promise<void> {
  await client.query(
    `DELETE FROM inbound_purchase_order_mirror m
      USING inbound_order io
      WHERE io.organization_id = $1 AND io.id = $2
        AND m.organization_id = io.organization_id AND m.source_type = io.source_type
        AND m.source_order_id = io.external_order_id
        AND NOT EXISTS (SELECT 1 FROM inbound_purchase_order_links l
                         WHERE l.organization_id = m.organization_id AND l.source_type = m.source_type
                           AND l.source_order_id = m.source_order_id)`,
    [orgId, inboundOrderId],
  );
  // The ledger keeps its history; the event says the order it landed was deleted.
  await client.query(
    `UPDATE inbound_ingest_event
        SET outcome = COALESCE(outcome, '{}'::jsonb) || jsonb_build_object('deletedOrderId', $2::bigint, 'deletedAt', now()),
            updated_at = now()
      WHERE organization_id = $1 AND inbound_order_id = $2`,
    [orgId, inboundOrderId],
  );
  await client.query(`DELETE FROM inbound_order WHERE organization_id = $1 AND id = $2`, [orgId, inboundOrderId]);
}
