/**
 * ingestInboundOrder — the ONE writer that lands an inbound order on the
 * Incoming spine, for every source (triage form, CSV, chat, marketplace / Zoho
 * sync, auto-replenish).
 *
 * One order = one transaction: the `inbound_order` header, every line
 * (`ingestPurchase` on the same client, keyed by line_key), the carton +
 * tracking links, the carton classifiers, and the ledger row all commit or
 * none do. A failure is recorded in the ledger on its own connection so it
 * stays visible (and retryable) after the rollback.
 *
 * Also here: the dry-run preview the form's outcome panel and a CSV staging
 * pass read, and the guarded delete for an order entered by mistake.
 */

import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import { ingestPurchase, type IngestPurchaseDeps } from './ingest-purchase';
import { upsertInboundMirror } from './mirror';
import { upsertPurchaseLink, type TxClient } from './purchase-links';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
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
} from './inbound-order-draft';

export type InboundOrderOrigin = 'manual' | 'csv' | 'chat' | 'sync' | 'auto_replenish';

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
  /** Ledger source: 'form' · 'csv' · 'chat' · 'zoho' · 'ebay' · 'amazon' · 'replenish'. */
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
}

const defaultDeps: IngestInboundOrderDeps = {
  ingestPurchase,
  registerShipment: async (trackingNumber, sourceSystem, orgId) =>
    (await registerShipmentPermissive({ trackingNumber, sourceSystem }, orgId))?.id ?? null,
};

const SHIPMENT_SOURCE: Record<string, string> = { ebay: 'ebay_purchase', amazon: 'amazon_purchase', manual: 'manual_inbound' };

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
    const result: IngestInboundOrderResult = {
      inboundOrderId: Number(prior.rows[0].id),
      created: false,
      unchanged: true,
      identity,
      lines: lines.rows.map((l) => ({ lineKey: l.line_key, receivingLineId: Number(l.id), created: false })),
      receivingId: lines.rows.find((l) => l.receiving_id != null)?.receiving_id ?? null,
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
    status: 'ISSUED',
    poDate: draft.orderDate,
    expectedDeliveryDate: draft.expectedDate,
    lineItems: mirrorLines,
    rawPayload: { via: `inbound-order:${ctx.origin}`, inboundOrderId, currency: draft.currency, notes: draft.notes || null },
    inboundOrderId,
    receivingType: draft.type,
    currency: draft.currency.toUpperCase(),
  };

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

  const result: IngestInboundOrderResult = {
    inboundOrderId,
    created: Boolean(header.rows[0].created),
    unchanged: false,
    identity,
    lines: landed,
    receivingId,
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
              CASE
                WHEN COALESCE(rl.quantity_received, 0) > 0 THEN 'units received'
                WHEN rl.scanned_at IS NOT NULL OR rl.unboxed_at IS NOT NULL OR rl.received_at IS NOT NULL
                  OR rl.received_done_at IS NOT NULL THEN 'already scanned at the door'
                WHEN EXISTS (SELECT 1 FROM receiving_line_unit u WHERE u.receiving_line_id = rl.id) THEN 'units attached'
                WHEN EXISTS (SELECT 1 FROM tech_serial_numbers t WHERE t.receiving_line_id = rl.id) THEN 'serials attached'
                WHEN EXISTS (SELECT 1 FROM testing_results t WHERE t.receiving_line_id = rl.id) THEN 'test results recorded'
                WHEN EXISTS (SELECT 1 FROM inventory_events e WHERE e.receiving_line_id = rl.id) THEN 'inventory moved'
              END AS blocker
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

    if (lineIds.length > 0) {
      // Dependents without ON DELETE CASCADE.
      await client.query(`DELETE FROM receiving_listing_links WHERE organization_id = $1 AND receiving_line_id = ANY($2::int[])`, [orgId, lineIds]);
      await client.query(
        `UPDATE shortage_inbound_links SET receiving_line_id = NULL, link_status = 'released', updated_at = now()
          WHERE organization_id = $1 AND receiving_line_id = ANY($2::int[])`,
        [orgId, lineIds],
      );
      await client.query(`UPDATE inbound_purchase_merge_log SET loser_line_id = NULL WHERE organization_id = $1 AND loser_line_id = ANY($2::int[])`, [orgId, lineIds]);
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
    return { inboundOrderId, deletedLineIds: lineIds, deletedCartonIds: deletedCartons, orderDeleted: true };
  });
}
