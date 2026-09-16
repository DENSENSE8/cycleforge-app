/**
 * Canonical Zoho inbound sync service.
 *
 * Data model:
 *   receiving_carton — physical package arrivals scanned at the dock.
 *   receiving_line   — authoritative inbound line items sourced from Zoho.
 *
 * This module keeps expected inbound state in receiving_line and only links a
 * physical receiving_carton row when the warehouse has actually scanned a package.
 */

// Wave 2 (tenancy): every write path is org-scoped. The caller threads a real
// `orgId` (from ctx.organizationId on session routes, the row's organization_id
// on background reconcilers, or the webhook/cron org resolver) and all tenant
// tables are written through `withTenantTransaction(orgId, …)` so the
// `app.current_org` GUC is set and RLS can enforce isolation. The previously
// hardcoded DOGFOOD_ORG_ID stamp is gone — see git history for the Phase-A3 debt.
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { withZohoCredential } from '@/lib/zoho/with-zoho-credential';
import { mergeEbayLinesIntoZohoPo } from '@/lib/inbound/merge-purchase-lines';
import { isIncomingUniversal } from '@/lib/feature-flags';
// Provider fetches route through the org's InventoryProvider facade
// (Integrations-as-SoT Wave B1); this module stays the inbound-sync
// implementation detail on top of it. The withZohoCredential wrapping
// (operation allowlist + credential-usage audit) is kept at each call site.
import { requireInventoryProvider, type InventoryProvider } from '@/lib/integrations/inventory';
import { formatApiOffsetTimestamp, formatPSTTimestamp } from '@/utils/date';
// Wave-3 writer inversion: zoho-cluster + testing facts are written directly to
// the 1:1 facts tables (receiving_line_zoho / receiving_line_testing) — the spine
// no longer carries those columns. upsertReceivingLineZoho derives
// zoho_purchaseorder_number_norm from the number (the retired spine column was
// GENERATED ALWAYS; the helper mirrors it).
import {
  upsertReceivingLineTesting,
  upsertReceivingLineZoho,
  type ZohoFactsInput,
} from '@/lib/receiving/facts/narrow';
import type { FactsDeps } from '@/lib/receiving/facts/store';
import type { PoolClient } from 'pg';
import { getSyncCursor, updateSyncCursor } from '@/lib/sync-cursors';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { isLocalPickupPo } from '@/lib/receiving/fulfillment-mode';
import { shouldSkipPoDetailFetch } from '@/lib/zoho/call-reduction';

type AnyRow = Record<string, unknown>;
type WorkflowStatus = 'EXPECTED' | 'MATCHED';

function asObject(value: unknown): AnyRow | null {
  return value && typeof value === 'object' ? (value as AnyRow) : null;
}

function asString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function asPositiveInt(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 0;
}

/**
 * First finite, non-negative numeric value → a Number (unit cost / rate); else
 * null. Zoho PO line `rate` arrives as a number or numeric string. NULL (not 0)
 * for missing so we never fabricate a $0 cost. Receiving redesign Phase 1:
 * mirror of the Zoho line.rate into receiving_line.unit_price (Zoho = SoR).
 */
function asMoney(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function getZohoLastModifiedTime(row: AnyRow): string | null {
  return asString(
    row.last_modified_time,
    row.last_modified_at,
    row.updated_time,
    row.modified_time,
    row.created_time
  );
}

type LocalPickupSyncInput = {
  normalizedPoId: string;
  poNumber: string;
  poReference: string | null;
  lineItems: unknown[];
};

// Idempotent upsert of a Zoho PO into local_pickup_orders + items. Skips the
// receiving_carton / receiving_line / shipping_tracking_numbers tables entirely —
// local pickups have no carrier identity and are operated entirely from the
// local-pickup queue UI.
async function syncLocalPickupOrder(
  client: PoolClient,
  orgId: OrgId,
  input: LocalPickupSyncInput,
): Promise<SyncPOLinesResult> {
  const { normalizedPoId, poNumber, poReference, lineItems } = input;

  // Serialize concurrent syncs of the same Zoho PO via a session-scoped
  // advisory lock. Without it, two interleaved syncs could write a header
  // from snapshot A while lines from snapshot B land — leaving the order
  // half-stale. The lock key is derived from the PO id so different POs
  // sync in parallel. Released automatically at txn end.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('local_pickup_orders.zoho_po_id'), hashtext($1))`,
    [normalizedPoId],
  );

  // Upsert the order header keyed on the Zoho PO id (partial-unique index
  // ux_local_pickup_orders_zoho_po). Existing rows are touched lightly so a
  // re-sync refreshes the displayed PO# and reference# without overwriting
  // operator-curated fields like customer_name, status, or notes. COALESCE
  // protects against a partial Zoho fetch nulling fields that the previous
  // sync populated.
  const orderRes = await client.query<{ id: number; xmax: string }>(
    `INSERT INTO local_pickup_orders (
       zoho_po_id, zoho_purchaseorder_number, zoho_reference_number, status, organization_id
     )
     VALUES ($1, $2, $3, 'DRAFT', $4)
     ON CONFLICT (zoho_po_id) WHERE zoho_po_id IS NOT NULL
     DO UPDATE SET
       zoho_purchaseorder_number = COALESCE(EXCLUDED.zoho_purchaseorder_number, local_pickup_orders.zoho_purchaseorder_number),
       zoho_reference_number     = COALESCE(EXCLUDED.zoho_reference_number, local_pickup_orders.zoho_reference_number),
       updated_at                = NOW()
     RETURNING id, xmax::text`,
    [normalizedPoId, poNumber, poReference, orgId],
  );
  const orderId = Number(orderRes.rows[0].id);
  const orderPreexisting = orderRes.rows[0].xmax !== '0';

  let synced = 0;
  let skipped = 0;

  for (const rawLine of lineItems) {
    const line = asObject(rawLine);
    if (!line) {
      skipped++;
      continue;
    }

    const zohoItemId     = asString(line.item_id);
    const zohoLineItemId = asString(line.line_item_id, line.id);
    const sku            = asString(line.sku);
    const productTitle   = asString(line.name, line.item_name);
    const quantity       = asPositiveInt(line.quantity);

    // SKU is NOT NULL on local_pickup_order_items; quantity must be > 0.
    if (!zohoLineItemId || !sku || quantity <= 0) {
      skipped++;
      continue;
    }

    await client.query(
      `INSERT INTO local_pickup_order_items (
         order_id, sku, product_title, quantity,
         zoho_item_id, zoho_line_item_id, organization_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT organization_id FROM local_pickup_orders WHERE id = $1))
       ON CONFLICT (order_id, zoho_line_item_id) WHERE zoho_line_item_id IS NOT NULL
       DO UPDATE SET
         sku           = EXCLUDED.sku,
         product_title = EXCLUDED.product_title,
         quantity      = EXCLUDED.quantity,
         zoho_item_id  = EXCLUDED.zoho_item_id,
         updated_at    = NOW()`,
      [orderId, sku, productTitle, quantity, zohoItemId, zohoLineItemId],
    );
    synced++;
  }

  return {
    purchaseorder_id: normalizedPoId,
    purchaseorder_number: poNumber,
    reference_number: poReference || null,
    po_notes: null,
    line_items_synced: synced,
    line_items_skipped: skipped,
    line_items_linked: 0,
    mode: orderPreexisting ? 'updated' : 'inserted',
  };
}

/**
 * Bind the narrow-facts helpers to the caller's transaction client so the thin
 * spine line and its 1:1 zoho/testing rows commit atomically (same txDeps shape
 * as returned-serial-link.ts). Org scoping comes from the transaction's GUC.
 */
function factsTxDeps(client: PoolClient): FactsDeps {
  return {
    query: ((_org: OrgId, sql: string, p?: unknown[]) =>
      client.query(sql, p)) as FactsDeps['query'],
  };
}

type SyncPOLinesOptions = {
  receivingId?: number | null;
  workflowStatus?: WorkflowStatus;
};

type SyncPOLinesResult = {
  purchaseorder_id: string;
  purchaseorder_number: string;
  /** Zoho PO Reference# — inbound tracking identity (also registered on receiving.shipment_id). */
  reference_number: string | null;
  /** Zoho PO header notes — used for eBay order# substring matching during merge. */
  po_notes: string | null;
  line_items_synced: number;
  line_items_skipped: number;
  line_items_linked: number;
  mode: 'inserted' | 'updated';
};

async function syncPurchaseOrderLines(
  client: PoolClient,
  orgId: OrgId,
  inventory: InventoryProvider,
  purchaseOrderId: string,
  options: SyncPOLinesOptions = {}
): Promise<SyncPOLinesResult> {
  const poId = asString(purchaseOrderId);
  if (!poId) throw new Error('purchaseorder_id is required');

  // Serialize concurrent imports of the same Zoho PO (e.g. two scans of the
  // same tracking landing in parallel). The advisory lock is keyed on the
  // PO id, so unrelated POs still sync in parallel. Released on txn end.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('zoho_purchaseorder_sync'), hashtext($1))`,
    [poId],
  );

  // Scope the Zoho fetch to this tenant's credential + allowlisted operation
  // (per-org creds via withZohoOrg, audited, deny-by-default on the operation).
  const detail = await withZohoCredential(orgId, 'purchaseorders.read', () =>
    inventory.getPurchaseOrder(poId),
  );
  const po = asObject((detail as AnyRow)?.purchaseorder);
  if (!po) throw new Error(`Zoho purchase order not found: ${poId}`);

  const normalizedPoId = asString(po.purchaseorder_id, poId) || poId;
  const poNumber = asString(po.purchaseorder_number) || normalizedPoId;
  const lineItems = Array.isArray(po.line_items) ? po.line_items : [];
  const poReference = asString(po.reference_number);

  // Auto-route: a PO whose reference#/PO number/PO id contains "LCPU" or
  // "LOCALPICKUP" is a local pickup, not a carrier shipment. Local pickups
  // have no tracking and live entirely in local_pickup_orders +
  // local_pickup_order_items — they bypass receiving_carton / receiving_line /
  // shipping_tracking_numbers altogether.
  if (isLocalPickupPo(poReference, poNumber, normalizedPoId)) {
    return syncLocalPickupOrder(client, orgId, {
      normalizedPoId,
      poNumber,
      poReference,
      lineItems,
    });
  }

  // Zoho PO Reference# carries the tracking number per the inbound contract.
  // Register it in shipping_tracking_numbers once per PO so receiving rows can
  // link via receiving_carton.shipment_id (canonical, replaces the legacy
  // receiving_line.zoho_reference_number text column).
  let shipmentId: number | null = null;
  if (poReference) {
    const shipment = await registerShipmentPermissive({
      trackingNumber: poReference,
      sourceSystem: 'zoho_po',
    }, orgId);
    shipmentId = shipment?.id ?? null;
  }

  // Make sure a parent `receiving` row exists for this PO with the
  // shipment_id stamped, so the soft JOIN in /api/receiving-lines can find
  // the carrier status without requiring an operator scan first. Two paths:
  //
  //   1) options.receivingId is provided (scan-driven path) — stamp on that
  //      row, never create a sibling.
  //   2) options.receivingId is null (cron sync path) — upsert the canonical
  //      zoho_po receiving row (idempotent via ux_receiving_zoho_po_matched).
  //
  // When `shipmentId` is null (reference# missing / unregisterable), we still
  // upsert the receiving row so the carrier-sync cron can attach a shipment
  // later via the existing soft JOIN. shipment_id stays NULL until then.
  if (options.receivingId) {
    if (shipmentId != null) {
      await client.query(
        `UPDATE receiving_carton
            SET shipment_id = $1,
                updated_at  = NOW()
          WHERE id = $2
            AND (shipment_id IS NULL OR shipment_id <> $1)`,
        [shipmentId, options.receivingId],
      );
    }
  } else {
    // organization_id stamped from the threaded tenant. Required so the row
    // survives the loud-fail org default once receiving has FORCE isolation,
    // and so a re-sync from another tenant can never adopt this PO's carton.
    await client.query(
      // Base table (not the `receiving` compat view): ON CONFLICT is unsupported
      // on auto-updatable views. 2026-07-05d.
      `INSERT INTO receiving_carton
         (source, zoho_purchaseorder_id, zoho_purchaseorder_number,
          shipment_id, organization_id, created_at, updated_at)
       VALUES ('zoho_po', $1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (zoho_purchaseorder_id)
         WHERE source = 'zoho_po' AND zoho_purchaseorder_id IS NOT NULL
       DO UPDATE SET
         zoho_purchaseorder_number = COALESCE(EXCLUDED.zoho_purchaseorder_number, receiving_carton.zoho_purchaseorder_number),
         shipment_id               = COALESCE(receiving_carton.shipment_id, EXCLUDED.shipment_id),
         organization_id           = COALESCE(receiving_carton.organization_id, EXCLUDED.organization_id),
         updated_at                = NOW()`,
      [normalizedPoId, poNumber, shipmentId, orgId],
    );
  }

  let synced = 0;
  let skipped = 0;
  let linked = 0;
  let mode: 'inserted' | 'updated' = 'inserted';
  const workflowStatus = options.receivingId ? (options.workflowStatus || 'MATCHED') : 'EXPECTED';
  const syncedAt = formatPSTTimestamp();
  const lastModifiedTime = getZohoLastModifiedTime(po);
  const txDeps = factsTxDeps(client);

  for (const rawLine of lineItems) {
    const line = asObject(rawLine);
    if (!line) {
      skipped++;
      continue;
    }

    const zohoItemId = asString(line.item_id);
    const zohoLineItemId = asString(line.line_item_id, line.id);
    const quantityExpected = asPositiveInt(line.quantity);
    if (!zohoItemId || quantityExpected <= 0) {
      skipped++;
      continue;
    }

    // Dedupe is keyed on receiving_line_zoho's org-led unique
    // ux_receiving_line_zoho_org_po_line (organization_id, zoho_purchaseorder_id,
    // zoho_line_item_id) — the spine zoho columns and their unique index are gone
    // after the Wave-3 inversion.
    const existing = zohoLineItemId
      ? await client.query<{ id: number; receiving_id: number | null; workflow_status: string | null }>(
          // FOR UPDATE OF rl: the adoption below reads workflow_status and (maybe)
          // transitions it via the chokepoint — lock the line row so a concurrent
          // writer can't move it between the read and the transition.
          `SELECT rl.id, rl.receiving_id, rl.workflow_status::text AS workflow_status
           FROM receiving_line_zoho rz
           JOIN receiving_line rl ON rl.id = rz.receiving_line_id
           WHERE rz.organization_id = $3
             AND rz.zoho_purchaseorder_id = $1
             AND rz.zoho_line_item_id = $2
           LIMIT 1
           FOR UPDATE OF rl`,
          [normalizedPoId, zohoLineItemId, orgId]
        )
      : { rows: [] as Array<{ id: number; receiving_id: number | null; workflow_status: string | null }> };

    const existingRow = existing.rows[0] ?? null;
    const desiredReceivingId =
      options.receivingId && (!existingRow?.receiving_id || existingRow.receiving_id === options.receivingId)
        ? options.receivingId
        : existingRow?.receiving_id ?? null;

    const itemName = asString(line.name, line.item_name);
    const sku = asString(line.sku);

    // Zoho-mirror facts → receiving_line_zoho (1:1). zoho_notes is the per-line
    // Zoho description (NOT operator `notes`, which stays on the spine untouched
    // so a re-sync can never clobber it — 2026-06-24). unit_price is the read-only
    // mirror of the Zoho PO line rate (Zoho = SoR, Phase 1). The helper derives
    // zoho_purchaseorder_number_norm from the number.
    const zohoFacts: ZohoFactsInput = {
      zohoItemId,
      zohoLineItemId,
      zohoPurchaseOrderId: normalizedPoId,
      zohoPurchaseOrderNumber: poNumber,
      zohoNotes: asString(line.description),
      zohoSyncSource: 'purchase_order',
      zohoLastModifiedTime: lastModifiedTime,
      zohoSyncedAt: syncedAt,
      unitPrice: asMoney(line.rate),
    };

    if (existingRow) {
      // Zoho-mirror FACTS only — lifecycle (workflow_status) and linkage
      // (receiving_id) are deliberately NOT in this field sync
      // (Step D fold: the chokepoint owns lifecycle; see the adopt block below).
      // Spine keeps only the catalog-ish fields; the zoho cluster lives on rz.
      await client.query(
        `UPDATE receiving_line
            SET item_name = $1,
                sku = $2,
                quantity_expected = $3
          WHERE id = $4`,
        [itemName, sku, quantityExpected, existingRow.id],
      );
      await upsertReceivingLineZoho(orgId, existingRow.id, zohoFacts, txDeps);
      mode = 'updated';
      if (options.receivingId && !existingRow.receiving_id) {
        // Adoption, split per the Step D fold recipe: (1) linkage is a raw
        // receiving_id-only UPDATE that does NOT list workflow_status — so the
        // coarse trigger can't COALESCE-stamp scanned_at on a row that isn't
        // actually transitioning; (2) only a pre-adoption EXPECTED row whose
        // target differs advances through the guarded chokepoint (inside this
        // same caller transaction — the FOR UPDATE re-lock is a no-op).
        // skipEvent: this sync never emitted inventory_events for adoption.
        await client.query(
          `UPDATE receiving_line SET receiving_id = $1 WHERE id = $2`,
          [options.receivingId, existingRow.id],
        );
        if (existingRow.workflow_status === 'EXPECTED' && workflowStatus !== 'EXPECTED') {
          await transitionReceivingLine(
            { receivingLineId: existingRow.id, to: workflowStatus, skipEvent: true, station: 'SYSTEM' },
            client,
            orgId,
          );
        }
        linked++;
      }
    } else {
      // BIRTH: thin spine line (identity/quantities/birth workflow_status only) +
      // its 1:1 facts rows in the same transaction. organization_id stamped from
      // the threaded tenant (survives the loud-fail org default under FORCE
      // isolation, and pins the line to its tenant).
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO receiving_line
           (organization_id, receiving_id, item_name, sku,
            quantity_received, quantity_expected, workflow_status)
         VALUES ($1, $2, $3, $4, 0, $5, $6)
         RETURNING id`,
        [orgId, desiredReceivingId, itemName, sku, quantityExpected, workflowStatus],
      );
      const newLineId = Number(inserted.rows[0].id);
      // Birth invariant: every line birth creates its receiving_line_testing row
      // with the values the wide INSERT used to produce. needs_test was never set
      // by this writer — the LIVE spine default is FALSE (verified 2026-07-11:
      // 1361/1363 lines are false), so carry FALSE explicitly.
      await upsertReceivingLineTesting(orgId, newLineId, {
        needsTest: false,
        qaStatus: 'PENDING',
        dispositionCode: 'HOLD',
        conditionGrade: 'BRAND_NEW',
        dispositionAudit: [],
      }, txDeps);
      await upsertReceivingLineZoho(orgId, newLineId, zohoFacts, txDeps);
      if (options.receivingId) linked++;
    }

    synced++;
  }

  // Late-line adoption (cron/no-scan path): a line created or re-synced AFTER
  // the PO's box was already door-scanned would otherwise stay unattached
  // (receiving_id NULL, workflow EXPECTED) — the scan-time adoption in
  // lookup-po's linkLocalPoLinesToReceiving only catches lines that exist at
  // scan time. The receiving-lines list still shows such a line under the
  // scanned carton via its PO soft-join fallback, so the rail row reads
  // "EXPECTED" inside the SCANNED queue. Adopt exactly like the scan path:
  // attach to the PO's scanned zoho_po carton + advance EXPECTED → MATCHED.
  // ux_receiving_zoho_po_matched guarantees ≤1 such carton per PO.
  //
  // Step D fold: was one bulk UPDATE…FROM whose SET listed workflow_status
  // (CASE EXPECTED→MATCHED ELSE unchanged) — the coarse trigger fired for
  // every adopted straggler and COALESCE-stamped scanned_at even on rows that
  // didn't transition. Now: locked SELECT with the same join predicates → raw
  // receiving_id-only linkage UPDATE → per-row chokepoint transition for rows
  // genuinely in EXPECTED (skipEvent — the adopt never emitted an
  // inventory_event). Straggler volume is tiny; per-row loops are fine.
  if (!options.receivingId) {
    const strays = await client.query<{
      id: number;
      workflow_status: string | null;
      carton_id: number;
    }>(
      // Wave-3 cutover: the line's PO identity lives on receiving_line_zoho, and
      // the carton's door-received stamp lives on the triage street
      // (receiving_triage.door_received_at) — the spine no longer carries either.
      `SELECT rl.id, rl.workflow_status::text AS workflow_status, r.id AS carton_id
         FROM receiving_line rl
         JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id
          AND rz.organization_id = $2
          AND rz.zoho_purchaseorder_id = $1
         JOIN receiving_carton r
           ON r.source = 'zoho_po'
          AND r.zoho_purchaseorder_id = $1
          AND r.organization_id = $2
         JOIN receiving_triage rt
           ON rt.receiving_id = r.id
          AND rt.organization_id = $2
          AND rt.door_received_at IS NOT NULL
        WHERE rl.organization_id = $2
          AND rl.receiving_id IS NULL
        ORDER BY rl.id
        FOR UPDATE OF rl`,
      [normalizedPoId, orgId],
    );
    for (const stray of strays.rows) {
      await client.query(
        `UPDATE receiving_line SET receiving_id = $1 WHERE id = $2`,
        [stray.carton_id, stray.id],
      );
      if (stray.workflow_status !== 'EXPECTED') continue; // check-and-skip (no spurious trigger fire)
      await transitionReceivingLine(
        { receivingLineId: stray.id, to: 'MATCHED', skipEvent: true, station: 'SYSTEM' },
        client,
        orgId,
      );
    }
    linked += strays.rows.length;
  }

  // Attach the PO's canonical shipment to the physical receiving row (idempotent).
  // COALESCE preserves a shipment_id set earlier by a scan/lookup writer.
  if (options.receivingId && shipmentId != null) {
    await client.query(
      `UPDATE receiving_carton
          SET shipment_id = COALESCE(shipment_id, $1)
        WHERE id = $2`,
      [shipmentId, options.receivingId],
    );
  }

  // Overall PO note (Zoho PO header `notes`) → carton-level receiving_carton.zoho_notes
  // (the "Zoho Notes" tab's primary content; distinct from the per-line item
  // description in receiving_line.zoho_notes). Best-effort — never breaks the sync.
  const poNotes = asString(po.notes);
  if (poNotes) {
    try {
      if (options.receivingId) {
        await client.query(
          `UPDATE receiving_carton SET zoho_notes = $1, updated_at = NOW() WHERE id = $2`,
          [poNotes, options.receivingId],
        );
      } else {
        await client.query(
          `UPDATE receiving_carton SET zoho_notes = $1, updated_at = NOW()
            WHERE source = 'zoho_po' AND zoho_purchaseorder_id = $2 AND organization_id = $3`,
          [poNotes, normalizedPoId, orgId],
        );
      }
    } catch (err) {
      console.warn('[zoho-sync] receiving_carton.zoho_notes update skipped:', err instanceof Error ? err.message : err);
    }
  }

  return {
    purchaseorder_id: normalizedPoId,
    purchaseorder_number: poNumber,
    reference_number: poReference || null,
    po_notes: poNotes || null,
    line_items_synced: synced,
    line_items_skipped: skipped,
    line_items_linked: linked,
    mode,
  };
}

export type ImportPOResult = SyncPOLinesResult;

/**
 * Sync all line items from a single Zoho Purchase Order into receiving_line.
 * When receivingId is provided, any still-unmatched lines are linked to that
 * physical receiving_carton row and moved to MATCHED.
 */
export async function importZohoPurchaseOrderToReceiving(
  orgId: OrgId,
  purchaseOrderId: string,
  options: SyncPOLinesOptions = {}
): Promise<ImportPOResult> {
  // Resolve the org's inventory provider once, outside the transaction — a
  // not-connected org fails fast with the typed error instead of holding a txn.
  const inventory = await requireInventoryProvider(orgId);

  // withTenantTransaction opens the transaction, sets the `app.current_org`
  // GUC via SET LOCAL, and uses the tenant pool — so every write inside (incl.
  // the advisory locks that need a transaction) is org-scoped and RLS-subject.
  const result = await withTenantTransaction(orgId, (client) =>
    syncPurchaseOrderLines(client, orgId, inventory, purchaseOrderId, options),
  );

  // Universal Incoming (Phase 3, plan §5.4): collapse any eBay-buyer Incoming line
  // that is the same real purchase as this Zoho PO into ONE spine row (equivalence
  // + secondary zoho link + conservative loser-row merge). Flag-gated per org and
  // fire-and-forget — a merge fault (or the inbound tables not yet migrated) never
  // fails the Zoho import.
  try {
    if (await isIncomingUniversal(orgId)) {
      await mergeEbayLinesIntoZohoPo(orgId, {
        zohoPurchaseOrderId: result.purchaseorder_id,
        poNumber: result.purchaseorder_number,
        tracking: result.reference_number,
        referenceNumber: result.reference_number,
        notes: result.po_notes,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Merge is best-effort (must not fail the Zoho import), but schema/code faults
    // are logged at error severity so production monitoring catches them.
    console.error('[zoho-sync] mergeEbayLinesIntoZohoPo failed:', message);
  }

  return result;
}

export type BulkSyncOptions = {
  status?: string;
  vendor_id?: string;
  last_modified_time?: string;
  days_back?: number;
  per_page?: number;
  max_pages?: number;
  max_items?: number;
  /**
   * ISO date `YYYY-MM-DD`. POs with `po.date < po_date_floor` are skipped
   * client-side (Zoho's REST list filter doesn't expose a po_date range,
   * only `last_modified_time`). The incoming-po-sync cron sets this so
   * pre-cutover POs never re-enter `receiving_line`.
   */
  po_date_floor?: string;
};

export type BulkSyncSummary = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  linked: number;
  line_items_synced: number;
  /** How many POs were skipped because po.date < po_date_floor. */
  skipped_pre_floor: number;
  /**
   * How many POs were skipped because local `receiving_line_zoho` already
   * mirrors the list row's last-modified stamp (avoids a detail GET per PO).
   */
  skipped_unchanged: number;
  errors: Array<{ purchaseorder_id: string; error: string }>;
};

/**
 * True when this org already has line rows for the PO whose stored Zoho
 * last-modified stamp matches the list payload — safe to skip the detail GET.
 */
async function isLocalReceivingPoFresh(
  orgId: OrgId,
  zohoPurchaseOrderId: string,
  listLastModified: string | null,
): Promise<boolean> {
  const { rows } = await tenantQuery<{
    line_count: number;
    max_last_modified: string | null;
  }>(
    orgId,
    `SELECT COUNT(*)::int AS line_count,
            MAX(zoho_last_modified_time) AS max_last_modified
       FROM receiving_line_zoho
      WHERE organization_id = $1
        AND zoho_purchaseorder_id = $2`,
    [orgId, zohoPurchaseOrderId],
  );
  const row = rows[0];
  return shouldSkipPoDetailFetch({
    listLastModified,
    localLineCount: Number(row?.line_count ?? 0),
    localMaxLastModified: row?.max_last_modified ?? null,
  });
}

export async function syncZohoPurchaseOrdersToReceiving(
  orgId: OrgId,
  opts: BulkSyncOptions = {}
): Promise<BulkSyncSummary> {
  const perPage = Math.min(200, Math.max(1, Number(opts.per_page) || 200));
  const maxPages = Math.min(100, Math.max(1, Number(opts.max_pages) || 50));
  const maxItems = Math.min(10000, Math.max(1, Number(opts.max_items) || 5000));

  let lastModifiedTime = String(opts.last_modified_time || '').trim() || undefined;
  if (!lastModifiedTime && opts.days_back && Number(opts.days_back) > 0) {
    const cutoff = new Date(Date.now() - Number(opts.days_back) * 24 * 60 * 60 * 1000);
    lastModifiedTime = formatApiOffsetTimestamp(cutoff);
  }
  if (!lastModifiedTime && !opts.days_back) {
    const cursor = await getSyncCursor('zoho_purchase_orders', orgId);
    if (cursor) {
      lastModifiedTime = formatApiOffsetTimestamp(cursor);
    }
  }

  // Defensive normalize: only accept exact YYYY-MM-DD. Anything else (empty,
  // bad format) → no floor. Comparison is lexical against po.date which Zoho
  // returns as `YYYY-MM-DD`, so string compare is correct here.
  const poDateFloor = /^\d{4}-\d{2}-\d{2}$/.test(String(opts.po_date_floor || '').trim())
    ? String(opts.po_date_floor).trim()
    : '';

  const summary: BulkSyncSummary = {
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    linked: 0,
    line_items_synced: 0,
    skipped_pre_floor: 0,
    skipped_unchanged: 0,
    errors: [],
  };

  const inventory = await requireInventoryProvider(orgId);

  for (let page = 1; page <= maxPages && summary.processed < maxItems; page++) {
    const data = await withZohoCredential(orgId, 'purchaseorders.read', () =>
      inventory.listPurchaseOrders({
        page,
        per_page: perPage,
        status: opts.status || undefined,
        vendor_id: opts.vendor_id || undefined,
        last_modified_time: lastModifiedTime,
      }),
    );

    const rows = (data as AnyRow).purchaseorders;
    const pos = Array.isArray(rows) ? rows : [];
    if (pos.length === 0) break;

    for (const po of pos) {
      if (summary.processed >= maxItems) break;
      summary.processed++;

      const poRow = po as AnyRow;

      // Skip POs authored before the configured floor. Zoho returns
      // `date` as `YYYY-MM-DD`; string compare is fine on that format.
      if (poDateFloor) {
        const poDate = String(poRow.date ?? poRow.po_date ?? '').trim();
        if (poDate && poDate < poDateFloor) {
          summary.skipped_pre_floor++;
          continue;
        }
      }
      const zohoId =
        asString(poRow.purchaseorder_id, poRow.purchase_order_id, poRow.id) ?? 'unknown';

      try {
        // List payloads are header-only (no line_items). Skip the per-PO detail
        // GET when local lines already carry the same last-modified stamp —
        // this is the main rate-limit saver on the 15m incoming-po-sync cron.
        const listLm = getZohoLastModifiedTime(poRow);
        if (zohoId !== 'unknown' && (await isLocalReceivingPoFresh(orgId, zohoId, listLm))) {
          summary.skipped_unchanged++;
          continue;
        }

        const result = await importZohoPurchaseOrderToReceiving(orgId, zohoId);
        summary.line_items_synced += result.line_items_synced;
        summary.linked += result.line_items_linked;
        if (result.mode === 'inserted') summary.created++;
        else summary.updated++;
      } catch (err: unknown) {
        summary.failed++;
        if (summary.errors.length < 50) {
          summary.errors.push({
            purchaseorder_id: zohoId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    const pageCtx = (data as AnyRow)?.page_context as AnyRow | undefined;
    const hasMore = Boolean(pageCtx?.has_more_page);
    if (!hasMore) break;
  }

  if (summary.failed === 0) {
    await updateSyncCursor('zoho_purchase_orders', new Date(), orgId).catch(() => {});
  }

  return summary;
}

// Legacy: import by Purchase Receive for backward compatibility.

export type ImportResult = {
  purchase_receive_id: string;
  line_items_synced: number;
  line_items_skipped: number;
  mode: 'inserted' | 'updated';
};

export async function importZohoPurchaseReceiveToReceiving(options: {
  orgId: OrgId;
  purchaseReceiveId: string;
  receivedBy?: number | null;
  assignedTechId?: number | null;
  needsTest?: boolean;
  targetChannel?: string | null;
}): Promise<ImportResult> {
  const { orgId } = options;
  const receiveIdInput = asString(options.purchaseReceiveId);
  if (!receiveIdInput) throw new Error('purchase_receive_id is required');

  const inventory = await requireInventoryProvider(orgId);
  const detail = await withZohoCredential(orgId, 'purchasereceives.read', () =>
    inventory.getPurchaseReceive(receiveIdInput),
  );
  const receive = asObject((detail as AnyRow)?.purchasereceive);
  if (!receive) throw new Error('Zoho purchase receive not found');

  const normalizedReceiveId =
    asString(receive.purchase_receive_id, receive.receive_id, receive.id, receiveIdInput) ||
    receiveIdInput;

  const lineItems = Array.isArray(receive.line_items) ? receive.line_items : [];

  // All receiving_line writes run org-scoped under the tenant GUC.
  return withTenantTransaction(orgId, async (client) => {
    let synced = 0;
    let skipped = 0;
    let mode: 'inserted' | 'updated' = 'inserted';
    const syncedAt = formatPSTTimestamp();
    const lastModifiedTime = getZohoLastModifiedTime(receive);
    const txDeps = factsTxDeps(client);

    for (const rawLine of lineItems) {
      const line = asObject(rawLine);
      if (!line) {
        skipped++;
        continue;
      }

      const zohoItemId = asString(line.item_id);
      const zohoLineItemId = asString(line.line_item_id, line.id);
      const qty = asPositiveInt(line.quantity, line.accepted_quantity, line.quantity_received);
      if (!zohoItemId || qty <= 0) {
        skipped++;
        continue;
      }

      // Dedupe keyed on receiving_line_zoho's org-led unique
      // ux_receiving_line_zoho_org_pr_line (organization_id,
      // zoho_purchase_receive_id, zoho_line_item_id) — the spine zoho columns
      // are gone after the Wave-3 inversion.
      const existing = zohoLineItemId
        ? await client.query<{ id: number }>(
            `SELECT rl.id
             FROM receiving_line_zoho rz
             JOIN receiving_line rl ON rl.id = rz.receiving_line_id
             WHERE rz.organization_id = $3
               AND rz.zoho_purchase_receive_id = $1
               AND rz.zoho_line_item_id = $2
             LIMIT 1`,
            [normalizedReceiveId, zohoLineItemId, orgId]
          )
        : { rows: [] as Array<{ id: number }> };

      const existingId = existing.rows[0]?.id ?? null;
      const itemName = asString(line.name, line.item_name);
      const sku = asString(line.sku);
      // Zoho-mirror facts → receiving_line_zoho (unit_price = read-only mirror of
      // the Zoho receive line rate, Zoho = SoR; number_norm derived by the helper).
      const zohoFacts: ZohoFactsInput = {
        zohoItemId,
        zohoLineItemId,
        zohoPurchaseReceiveId: normalizedReceiveId,
        zohoPurchaseOrderId: asString(receive.purchaseorder_id),
        zohoPurchaseOrderNumber: asString(receive.purchaseorder_number),
        zohoNotes: asString(line.description),
        zohoSyncSource: 'purchase_receive',
        zohoLastModifiedTime: lastModifiedTime,
        zohoSyncedAt: syncedAt,
        unitPrice: asMoney(line.rate),
      };

      if (existingId) {
        // Spine keeps only the catalog-ish fields; the zoho cluster lives on rz.
        await client.query(
          `UPDATE receiving_line
              SET item_name = $1,
                  sku = $2,
                  quantity_received = $3,
                  quantity_expected = $4
            WHERE id = $5`,
          [itemName, sku, qty, asPositiveInt(line.quantity), existingId],
        );
        await upsertReceivingLineZoho(orgId, existingId, zohoFacts, txDeps);
        mode = 'updated';
      } else {
        // BIRTH: thin spine line + its 1:1 facts rows in the same transaction.
        // Org stamped from the threaded tenant (survives the loud-fail default
        // under FORCE isolation, and pins the line to its tenant). This path never
        // set workflow_status or receiving_id — the spine defaults apply, as before.
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO receiving_line
             (organization_id, item_name, sku, quantity_received, quantity_expected)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [orgId, itemName, sku, qty, asPositiveInt(line.quantity)],
        );
        const newLineId = Number(inserted.rows[0].id);
        // Birth invariant (see syncPurchaseOrderLines): explicit testing-facts row;
        // needs_test carries the LIVE spine default of FALSE (verified 2026-07-11).
        await upsertReceivingLineTesting(orgId, newLineId, {
          needsTest: false,
          qaStatus: 'PENDING',
          dispositionCode: 'HOLD',
          conditionGrade: 'BRAND_NEW',
          dispositionAudit: [],
        }, txDeps);
        await upsertReceivingLineZoho(orgId, newLineId, zohoFacts, txDeps);
      }
      synced++;
    }

    return {
      purchase_receive_id: normalizedReceiveId,
      line_items_synced: synced,
      line_items_skipped: skipped,
      mode,
    };
  });
}
