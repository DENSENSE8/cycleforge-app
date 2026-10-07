/**
 * Repair: one purchase = one receiving line (2026-10-04).
 *
 * The 2026-09 eBay buyer imports minted a SECOND receiving line + carton for
 * purchases a Zoho PO already held (eBay order id = PO#), and stored their
 * tracking as `9.434608106245533e+21` (the Trading XML parse coerced the
 * 22-digit number to a float — fixed in src/lib/ebay/purchase-client.ts).
 * The writer now attaches such orders to the PO (`findZohoTwin` in
 * ingest-inbound-order.ts); this script finds the twins already on the spine.
 *
 *   tsx --conditions=react-server scripts/repair-ebay-zoho-twins.ts [--org <uuid>] [--verbose]
 *   … --apply   (writes — only with the operator's approval)
 *   … --refetch-tracking [--apply]   (ask eBay for the true tracking; dry unless --apply)
 *
 * Twin rule = `duplicatePurchaseLineIds` (the pasted-number facts' rule, over
 * `matchZohoPo`): an eBay-imported line nothing was received on, whose
 * purchase is a Zoho PO line. Per twin, --apply (one transaction each):
 * links the eBay identity to the Zoho line (secondary) + records the
 * equivalence, then deletes the twin line and its carton when that ends up
 * empty and never scanned/unboxed (`deleteInboundLinesInTx`, the guarded
 * delete the order delete uses). A twin anything physical happened to is
 * skipped and listed.
 *
 * Scientific-notation tracking: every such shipment / eBay mirror row is
 * listed with (a) the true number when exactly one stored tracking renders to
 * it (`isScientificRenderingOf`) — --apply writes it back to the eBay mirror
 * row only — and (b) whether eBay can still be asked (order placed within the
 * Trading GetOrders 90-day window). Shipment rows are never rewritten here.
 *
 * Dry run: every statement inside `BEGIN READ ONLY … ROLLBACK` on the tenant
 * role (RLS on). No eBay call (a call can refresh the buyer token — a write).
 *
 * --refetch-tracking: every eBay snapshot row / shipment still holding a
 * scientific-notation number names its order; each buyer account is asked for
 * those orders by id (`fetchBuyerPurchaseOrdersByIds`, GetOrders OrderIDArray,
 * ≤100 per call). A refetched number is accepted only when the stored value
 * is exactly its rounding (`trueTrackingFor`). Dry: reports, and never
 * refreshes a buyer token (an expiring token stops that account, reported).
 * --apply: writes the true number to the snapshot row and re-lands the order
 * through the one writer (`landEbayPurchases` → `ingestInboundOrder`), which
 * gives its carton the real shipment (or attaches it to its Zoho PO).
 */

import { readFileSync } from 'node:fs';
import type { BuyerPurchaseLine } from '@/lib/ebay/purchase-client';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const GET_ORDERS_MAX_AGE_DAYS = 90;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Point both pools at the unpooled host BEFORE any db module loads (as scripts/bench-identify.ts). */
function useUnpooledHosts(): void {
  const env = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  if (!env.DATABASE_URL_UNPOOLED || !env.TENANT_APP_DATABASE_URL) {
    throw new Error('repair: DATABASE_URL_UNPOOLED and TENANT_APP_DATABASE_URL are required');
  }
  process.env.DATABASE_URL = env.DATABASE_URL_UNPOOLED;
  process.env.TENANT_APP_DATABASE_URL = env.TENANT_APP_DATABASE_URL.replace('-pooler.', '.');
}

interface EbayLineRow {
  id: number;
  receiving_id: number | null;
  inbound_order_id: number | null;
  source_order_id: string;
  source_line_item_id: string | null;
  quantity_received: number;
  sku: string | null;
  item_name: string | null;
  workflow_status: string;
  tracking_number: string | null;
  blocker: string | null;
  /** What deleting the line would erase (`INBOUND_LINE_HISTORY_SQL`); null = nothing. */
  history: string | null;
  /** The line's own door / unbox / receive stamps. */
  stamps: string[];
  carton_other_lines: number;
  carton_touched: boolean;
}

interface ZohoLineRow {
  id: number;
  receiving_id: number | null;
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string;
  zoho_purchaseorder_number_norm: string;
  tracking_number: string | null;
  tracking_normalized: string | null;
  quantity_received: number;
  workflow_status: string;
  stamps: string[];
  carton_touched: boolean;
}

interface Twin {
  ebay: EbayLineRow;
  zoho: ZohoLineRow;
  reason: string;
}

async function main(): Promise<void> {
  useUnpooledHosts();
  const orgId = arg('org', DEFAULT_ORG);
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error(`bad --org ${orgId}`);
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');

  // Dynamic on purpose: `@/lib/db` builds its pools from process.env at module load.
  const { tenantPool } = await import('@/lib/db');
  const { inlineSqlParams } = await import('@/lib/tenancy/inline-params');
  const { withTenantTransaction } = await import('@/lib/tenancy/db');
  const { duplicatePurchaseLineIds } = await import('@/lib/receiving/pasted-number-facts');
  const { matchZohoPo } = await import('@/lib/inbound/purchase-match');
  const { isScientificRenderingOf, scientificTrackingProbe } = await import('@/lib/inbound/inbound-order-draft');
  const { SCIENTIFIC_NOTATION_TRACKING } = await import('@/lib/tracking-format');
  const { INBOUND_LINE_DELETE_BLOCKER_SQL, INBOUND_LINE_HISTORY_SQL, deleteInboundLinesInTx } = await import('@/lib/inbound/ingest-inbound-order');
  const { upsertPurchaseLink } = await import('@/lib/inbound/purchase-links');
  const { recordEquivalence } = await import('@/lib/inbound/equivalence');
  const { canonicalizeTrackingKey } = await import('@/lib/zoho/call-reduction');

  /** One message: read-only transaction, org GUC, statement, rollback. */
  async function readOnly<R>(sql: string, params: unknown[] = []): Promise<R[]> {
    const client = await tenantPool.connect();
    try {
      const results = (await client.query(
        `BEGIN READ ONLY;\nSELECT set_config('app.current_org', '${orgId}', true);\n${inlineSqlParams(sql, params)};\nROLLBACK;`,
      )) as unknown as Array<{ rows: R[] }>;
      return results[results.length - 2].rows;
    } finally {
      client.release();
    }
  }
  const sci = SCIENTIFIC_NOTATION_TRACKING.source;

  if (process.argv.includes('--refetch-tracking')) {
    await refetchTracking();
    return;
  }

  /** Ask eBay for the true number behind every scientific-notation tracking still stored. */
  async function refetchTracking(): Promise<void> {
    const { trueTrackingFor } = await import('@/lib/inbound/inbound-order-draft');
    const { fetchBuyerPurchaseOrdersByIds, EbayBuyerTokenRefreshRequired } = await import('@/lib/ebay/purchase-client');
    const { listEbayBuyerAccounts, landEbayPurchases } = await import('@/lib/inbound/sync-ebay-purchases');
    const { ingestInboundOrder } = await import('@/lib/inbound/ingest-inbound-order');

    // Every order still holding a rounded number: its snapshot row, or a line whose carton's shipment does.
    const rows = await readOnly<{ order_id: string; sci: string; account: string | null; mirror_id: number | null }>(
      `SELECT m.source_order_id AS order_id, m.tracking_number AS sci, pa.integration_scope AS account, m.id AS mirror_id
         FROM inbound_purchase_order_mirror m
         LEFT JOIN platform_accounts pa ON pa.id = m.platform_account_id AND pa.organization_id = m.organization_id
        WHERE m.organization_id = $1 AND m.source_type = 'ebay' AND m.tracking_number ~* $2
       UNION
       SELECT rl.source_order_id, stn.tracking_number_raw, pa.integration_scope, NULL::bigint
         FROM receiving_line rl
         JOIN receiving_carton rc ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
         JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
         LEFT JOIN platform_accounts pa ON pa.id = rl.platform_account_id AND pa.organization_id = rl.organization_id
        WHERE rl.organization_id = $1 AND rl.inbound_source_type = 'ebay'
          AND NULLIF(TRIM(rl.source_order_id), '') IS NOT NULL AND stn.tracking_number_raw ~* $2`,
      [orgId, sci],
    );
    const byOrder = new Map<string, { sci: Set<string>; account: string | null; mirrorIds: Set<number> }>();
    for (const r of rows) {
      const entry = byOrder.get(r.order_id) ?? { sci: new Set<string>(), account: null, mirrorIds: new Set<number>() };
      entry.sci.add(r.sci.trim().toLowerCase());
      entry.account ??= r.account;
      if (r.mirror_id != null) entry.mirrorIds.add(Number(r.mirror_id));
      byOrder.set(r.order_id, entry);
    }
    const accounts = await listEbayBuyerAccounts(orgId as never);
    console.log(`org ${orgId} · refetch tracking · ${apply ? 'APPLY' : 'DRY RUN (no token refresh, no writes)'}`);
    console.log(`orders holding scientific-notation tracking: ${byOrder.size} (${rows.length} rows) · buyer accounts: ${accounts.map((a) => a.accountName).join(', ') || 'none'}`);

    const fetched = new Map<string, { account: string; lines: BuyerPurchaseLine[] }>();
    const errors: string[] = [];
    for (const account of accounts) {
      // An order whose account is known goes to that account; an unattributed one is asked of every account until found.
      const ids = [...byOrder].filter(([id, e]) => !fetched.has(id) && (e.account == null || e.account === account.accountName)).map(([id]) => id);
      if (ids.length === 0) continue;
      try {
        const lines = await fetchBuyerPurchaseOrdersByIds(orgId as never, account, ids, { allowRefresh: apply });
        for (const line of lines) {
          const got = fetched.get(line.sourceOrderId);
          if (got) got.lines.push(line);
          else fetched.set(line.sourceOrderId, { account: account.accountName, lines: [line] });
        }
      } catch (err) {
        errors.push(`${account.accountName}: ${err instanceof EbayBuyerTokenRefreshRequired ? 'TOKEN REFRESH NEEDED — ' : ''}${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const recovered: Array<{ orderId: string; account: string; sci: string; digits: string }> = [];
    const mismatched: string[] = [];
    const missing: string[] = [];
    for (const [orderId, entry] of byOrder) {
      const got = fetched.get(orderId);
      if (!got) {
        missing.push(orderId);
        continue;
      }
      for (const value of entry.sci) {
        const digits = trueTrackingFor(value, got.lines.map((l) => l.trackingNumber));
        if (digits) recovered.push({ orderId, account: got.account, sci: value, digits });
        else mismatched.push(`${orderId} ${value} ← eBay: ${[...new Set(got.lines.map((l) => l.trackingNumber ?? '∅'))].join(', ')}`);
      }
    }
    console.log(`eBay returned: ${fetched.size} orders · recovered (verified exact): ${new Set(recovered.map((r) => r.orderId)).size} orders / ${recovered.length} values`);
    console.log(`not returned by any account: ${missing.length} · returned but no number renders to the stored value: ${mismatched.length}`);
    for (const e of errors) console.log(`  eBay error — ${e}`);
    for (const m of verbose ? mismatched : mismatched.slice(0, 10)) console.log(`  mismatch ${m}`);
    for (const id of verbose ? missing : missing.slice(0, 10)) console.log(`  not returned ${id}`);
    for (const r of verbose ? recovered : recovered.slice(0, 10)) console.log(`  ${r.orderId.padEnd(19)} ${r.sci.padEnd(24)} → ${r.digits}`);
    if (!apply) return;

    let mirrorFixed = 0;
    let relanded = 0;
    for (const r of recovered) {
      const entry = byOrder.get(r.orderId)!;
      for (const mirrorId of entry.mirrorIds) {
        await withTenantTransaction(orgId as never, async (client) => {
          const u = await client.query(
            `UPDATE inbound_purchase_order_mirror SET tracking_number = $3, updated_at = now()
              WHERE organization_id = $1 AND id = $2 AND lower(tracking_number) = $4`,
            [orgId, mirrorId, r.digits, r.sci],
          );
          mirrorFixed += u.rowCount ?? 0;
        });
      }
    }
    // Re-land each recovered order once, through the one writer (its draft now carries the real number).
    for (const orderId of new Set(recovered.map((r) => r.orderId))) {
      const got = fetched.get(orderId)!;
      const landed = await landEbayPurchases(orgId as never, { accountName: got.account }, got.lines, ingestInboundOrder);
      relanded += landed.landed + landed.updated + landed.unchanged;
      for (const e of landed.errors) console.log(`  re-land error — ${e}`);
    }
    console.log(`\napplied: ${mirrorFixed} snapshot rows restored · ${relanded} orders re-landed`);
  }

  // ── 1. eBay lines nothing was received on (twin candidates) ────────────────
  const ebay = await readOnly<EbayLineRow>(
    `SELECT rl.id, rl.receiving_id, rl.inbound_order_id, rl.source_order_id, rl.source_line_item_id,
            COALESCE(rl.quantity_received, 0)::int AS quantity_received, rl.sku, rl.item_name,
            rl.workflow_status::text AS workflow_status, stn.tracking_number_raw AS tracking_number,
            ${INBOUND_LINE_DELETE_BLOCKER_SQL} AS blocker,
            ${INBOUND_LINE_HISTORY_SQL} AS history,
            array_remove(ARRAY[
              CASE WHEN rl.scanned_at IS NOT NULL THEN 'scanned' END,
              CASE WHEN rl.unboxed_at IS NOT NULL THEN 'unboxed' END,
              CASE WHEN rl.received_at IS NOT NULL THEN 'received' END,
              CASE WHEN rl.received_done_at IS NOT NULL THEN 'received_done' END], NULL) AS stamps,
            (SELECT count(*)::int FROM receiving_line o WHERE o.receiving_id = rl.receiving_id AND o.id <> rl.id) AS carton_other_lines,
            (EXISTS (SELECT 1 FROM receiving_scans s WHERE s.receiving_id = rl.receiving_id)
              OR EXISTS (SELECT 1 FROM receiving_unbox u WHERE u.receiving_id = rl.receiving_id)
              OR EXISTS (SELECT 1 FROM receiving_triage t WHERE t.receiving_id = rl.receiving_id AND t.door_received_at IS NOT NULL)
              OR EXISTS (SELECT 1 FROM receiving_exceptions x WHERE x.receiving_id = rl.receiving_id)) AS carton_touched
       FROM receiving_line rl
       LEFT JOIN receiving_carton rc ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
      WHERE rl.organization_id = $1 AND rl.inbound_source_type = 'ebay'
        AND COALESCE(rl.quantity_received, 0) = 0 AND NULLIF(TRIM(rl.source_order_id), '') IS NOT NULL
      ORDER BY rl.id`,
    [orgId],
  );

  // ── 2. Zoho PO lines those purchases may be (PO# = order id, or same tracking) ─
  const norms = [...new Set(ebay.map((l) => canonicalizeTrackingKey(l.source_order_id)))];
  const trackings = [...new Set(ebay.flatMap((l) => (l.tracking_number ? [canonicalizeTrackingKey(l.tracking_number)] : [])))];
  const zoho = await readOnly<ZohoLineRow>(
    `SELECT rl.id, rl.receiving_id, rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number, rz.zoho_purchaseorder_number_norm,
            stn.tracking_number_raw AS tracking_number, stn.tracking_number_normalized AS tracking_normalized,
            COALESCE(rl.quantity_received, 0)::int AS quantity_received, rl.workflow_status::text AS workflow_status,
            array_remove(ARRAY[
              CASE WHEN rl.scanned_at IS NOT NULL THEN 'scanned' END,
              CASE WHEN rl.unboxed_at IS NOT NULL THEN 'unboxed' END,
              CASE WHEN rl.received_at IS NOT NULL THEN 'received' END,
              CASE WHEN rl.received_done_at IS NOT NULL THEN 'received_done' END], NULL) AS stamps,
            (EXISTS (SELECT 1 FROM receiving_scans s WHERE s.receiving_id = rl.receiving_id)
              OR EXISTS (SELECT 1 FROM receiving_unbox u WHERE u.receiving_id = rl.receiving_id)
              OR EXISTS (SELECT 1 FROM receiving_triage t WHERE t.receiving_id = rl.receiving_id AND t.door_received_at IS NOT NULL)
              OR EXISTS (SELECT 1 FROM receiving_exceptions x WHERE x.receiving_id = rl.receiving_id)) AS carton_touched
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        AND rz.zoho_purchaseorder_id IS NOT NULL
       LEFT JOIN receiving_carton rc ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
      WHERE rl.organization_id = $1 AND COALESCE(rl.inbound_source_type, 'zoho') <> 'ebay'
        AND (rz.zoho_purchaseorder_number_norm = ANY($2::text[]) OR stn.tracking_number_normalized = ANY($3::text[]))
      ORDER BY rl.id`,
    [orgId, norms, trackings],
  );
  const zohoByNorm = new Map<string, ZohoLineRow[]>();
  const zohoByTracking = new Map<string, ZohoLineRow[]>();
  for (const z of zoho) {
    for (const [map, key] of [[zohoByNorm, z.zoho_purchaseorder_number_norm], [zohoByTracking, z.tracking_normalized]] as const) {
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(z);
      else map.set(key, [z]);
    }
  }

  const asRow = (line: Partial<ReceivingLineRow>) => line as ReceivingLineRow;
  const twins: Twin[] = [];
  for (const line of ebay) {
    const candidates = [
      ...(zohoByNorm.get(canonicalizeTrackingKey(line.source_order_id)) ?? []),
      ...(line.tracking_number ? zohoByTracking.get(canonicalizeTrackingKey(line.tracking_number)) ?? [] : []),
    ];
    if (candidates.length === 0) continue;
    const group = [
      asRow({ id: line.id, inbound_source_type: 'ebay', source_order_id: line.source_order_id, quantity_received: line.quantity_received, sku: line.sku, tracking_number: line.tracking_number }),
      ...candidates.map((z) => asRow({ id: z.id, inbound_source_type: null, zoho_purchaseorder_id: z.zoho_purchaseorder_id, zoho_purchaseorder_number: z.zoho_purchaseorder_number, tracking_number: z.tracking_number, quantity_received: z.quantity_received })),
    ];
    if (!duplicatePurchaseLineIds(group).has(line.id)) continue;
    // Its twin: the first Zoho line the shared rule names (received first, so the record that holds the units wins).
    const ranked = [...candidates].sort((a, b) => b.quantity_received - a.quantity_received || a.id - b.id);
    for (const z of ranked) {
      const reason = matchZohoPo(
        { receivingLineId: line.id, sourceOrderId: line.source_order_id, sku: line.sku, tracking: line.tracking_number },
        { zohoPurchaseOrderId: z.zoho_purchaseorder_id, poNumber: z.zoho_purchaseorder_number, tracking: z.tracking_number },
      );
      if (reason) {
        twins.push({ ebay: line, zoho: z, reason });
        break;
      }
    }
  }

  if (process.argv.includes('--merge-physical')) {
    await mergePhysical();
    return;
  }

  /**
   * Retire the twins the plain pass skipped (a stamp or an opened unit slot on
   * the duplicate). Rule, per twin:
   * - line: retired only when nothing a delete would erase sits on it
   *   (`INBOUND_LINE_HISTORY_SQL`: units, unit facts, serials, tests,
   *   inventory events, exceptions, claims, putaway, returns, pickup, repair);
   *   empty unit slots and stage projections go with it. Its door/unbox stamps
   *   must already be on the Zoho line (or that line is DONE) — else skipped.
   * - carton: the physical record (scans / unbox / door / exceptions) stays on
   *   exactly the carton it was written on. Same carton as the Zoho line →
   *   untouched. Twin carton physical, Zoho carton not → the twin's carton is
   *   the scanned box: listed for the operator (moving the Zoho line is a
   *   decision, not a cleanup). Both physical → both kept; the twin's carton
   *   stays as an empty record of what happened to it. Twin carton blank →
   *   deleted with the line (`deleteInboundLinesInTx`, guarded).
   */
  async function mergePhysical(): Promise<void> {
    type Plan = { twin: Twin; action: 'retire' | 'skip'; why: string; carton: string };
    const plans: Plan[] = twins.map((t) => {
      const zohoCovers = t.zoho.workflow_status === 'DONE' || t.ebay.stamps.every((s) => t.zoho.stamps.includes(s));
      const sameCarton = t.ebay.receiving_id != null && t.ebay.receiving_id === t.zoho.receiving_id;
      const carton = t.ebay.receiving_id == null
        ? 'no carton'
        : sameCarton
          ? `shared ${t.ebay.receiving_id} (kept)`
          : t.ebay.carton_touched
            ? t.zoho.carton_touched ? `twin ${t.ebay.receiving_id} kept (physical record), Zoho ${t.zoho.receiving_id}` : `twin ${t.ebay.receiving_id} is the scanned box, Zoho ${t.zoho.receiving_id} blank`
            : `twin ${t.ebay.receiving_id} deleted if empty`;
      if (t.ebay.history) return { twin: t, action: 'skip', why: `line history: ${t.ebay.history}`, carton };
      if (!zohoCovers) return { twin: t, action: 'skip', why: `stamps ${t.ebay.stamps.join('+')} not on Zoho line ${t.zoho.id} (${t.zoho.workflow_status})`, carton };
      if (!sameCarton && t.ebay.carton_touched && !t.zoho.carton_touched) {
        return { twin: t, action: 'skip', why: 'the twin carton holds the physical record, the Zoho carton none — operator decides which box survives', carton };
      }
      return { twin: t, action: 'retire', why: t.ebay.blocker ?? 'nothing physical', carton };
    });
    console.log(`org ${orgId} · merge physical · ${apply ? 'APPLY' : 'DRY RUN (read-only; --apply writes)'}`);
    console.log(`twins now: ${twins.length} · retire: ${plans.filter((p) => p.action === 'retire').length} · skip: ${plans.filter((p) => p.action === 'skip').length}`);
    const byWhy = plans.reduce<Record<string, number>>((acc, p) => ({ ...acc, [`${p.action}: ${p.why.replace(/\d+/g, '#')}`]: (acc[`${p.action}: ${p.why.replace(/\d+/g, '#')}`] ?? 0) + 1 }), {});
    for (const [why, n] of Object.entries(byWhy)) console.log(`  ${String(n).padStart(4)}  ${why}`);
    for (const p of plans) {
      console.log(`  ${p.action.padEnd(6)} line ${p.twin.ebay.id} (${p.twin.ebay.source_order_id}) → Zoho line ${p.twin.zoho.id} · ${p.carton} · ${p.why}`);
    }
    if (!apply) return;

    let retired = 0;
    const cartonsGone: number[] = [];
    for (const p of plans) {
      if (p.action !== 'retire') continue;
      const t = p.twin;
      await withTenantTransaction(orgId as never, async (client) => {
        const tx = client as unknown as Parameters<typeof deleteInboundLinesInTx>[0];
        // Re-checked under lock: both lines, the duplicate still clean.
        const live = await tx.query<{ id: number; history: string | null }>(
          `SELECT rl.id, ${INBOUND_LINE_HISTORY_SQL} AS history FROM receiving_line rl
            WHERE rl.organization_id = $1 AND rl.id = ANY($2::int[]) ORDER BY rl.id FOR UPDATE OF rl`,
          [orgId, [t.ebay.id, t.zoho.id]],
        );
        if (live.rows.length !== 2 || live.rows.find((r) => Number(r.id) === t.ebay.id)?.history) return;
        await upsertPurchaseLink(
          orgId as never,
          { receivingLineId: t.zoho.id, sourceType: 'ebay', sourceOrderId: t.ebay.source_order_id, sourceLineItemId: t.ebay.source_line_item_id, isPrimary: false },
          { withTx: (_o, fn) => fn(tx as never) },
        );
        await recordEquivalence(
          orgId as never,
          { sourceTypeA: 'ebay', sourceOrderIdA: t.ebay.source_order_id, sourceTypeB: 'zoho', sourceOrderIdB: t.zoho.zoho_purchaseorder_id, linkReason: t.reason as 'tracking' | 'order_number' },
          { query: (async (_o: unknown, sql: string, params?: ReadonlyArray<unknown>) => tx.query(sql, params)) as never },
        );
        const shared = t.ebay.receiving_id != null && t.ebay.receiving_id === t.zoho.receiving_id;
        cartonsGone.push(...(await deleteInboundLinesInTx(tx, orgId as never, [t.ebay.id], t.ebay.receiving_id != null && !shared ? [t.ebay.receiving_id] : [])));
        retired += 1;
      });
    }
    console.log(`\napplied: ${retired} twins retired · ${cartonsGone.length} empty blank cartons deleted`);
  }

  // ── 3. Scientific-notation tracking: shipments + eBay mirror rows ──────────
  const sciShipments = await readOnly<{ id: number; tracking_number_raw: string; cartons: number }>(
    `SELECT stn.id, stn.tracking_number_raw,
            (SELECT count(*)::int FROM receiving_carton rc WHERE rc.shipment_id = stn.id) AS cartons
       FROM shipping_tracking_numbers stn
      WHERE stn.tracking_number_raw ~* $1
      ORDER BY stn.id`,
    [sci],
  );
  // The order's date: the mirror's, else the landed order's (the 2026-09 imports left the mirror's blank).
  const sciMirror = await readOnly<{ id: number; source_order_id: string; tracking_number: string; po_date: string | null; account: string | null }>(
    `SELECT m.id, m.source_order_id, m.tracking_number,
            COALESCE(m.po_date, io.order_date, io.created_at::date)::text AS po_date,
            pa.integration_scope AS account
       FROM inbound_purchase_order_mirror m
       LEFT JOIN inbound_order io
         ON io.organization_id = m.organization_id AND io.source_type = m.source_type
        AND io.external_order_id = m.source_order_id
       LEFT JOIN platform_accounts pa ON pa.id = m.platform_account_id AND pa.organization_id = m.organization_id
      WHERE m.organization_id = $1 AND m.source_type = 'ebay' AND m.tracking_number ~* $2
      ORDER BY m.id`,
    [orgId, sci],
  );
  const sciValues = [...new Set([...sciShipments.map((s) => s.tracking_number_raw), ...sciMirror.map((m) => m.tracking_number)].map((v) => v.trim().toLowerCase()))];
  const probes = sciValues.flatMap((value) => {
    const p = scientificTrackingProbe(value);
    return p ? [{ value, ...p }] : [];
  });
  const found = probes.length === 0
    ? []
    : await readOnly<{ sci: string; candidate: string }>(
        `WITH stored AS (
           SELECT stn.tracking_number_normalized AS digits FROM shipping_tracking_numbers stn
           UNION
           -- A Zoho PO's reference # carries its tracking (the inbound contract).
           SELECT upper(regexp_replace(rz.zoho_reference_number, '[^A-Za-z0-9]', '', 'g'))
             FROM receiving_line_zoho rz WHERE rz.organization_id = $4 AND rz.zoho_reference_number IS NOT NULL
         )
         SELECT p.sci, s.digits AS candidate
           FROM unnest($1::text[], $2::text[], $3::int[]) AS p(sci, prefix, len)
           JOIN stored s ON length(s.digits) = p.len AND left(s.digits, length(p.prefix)) = p.prefix`,
        [probes.map((p) => p.value), probes.map((p) => p.prefix), probes.map((p) => p.length), orgId],
      );
  const recovered = new Map<string, string | null>();
  for (const value of sciValues) {
    const exact = [...new Set(found.filter((f) => f.sci === value && isScientificRenderingOf(value, f.candidate)).map((f) => f.candidate))];
    recovered.set(value, exact.length === 1 ? exact[0]! : null);
  }
  const askableSince = Date.now() - GET_ORDERS_MAX_AGE_DAYS * 86_400_000;

  // ── Report ─────────────────────────────────────────────────────────────────
  const blocked = twins.filter((t) => t.ebay.blocker);
  const cartonsDeleted = new Set(
    twins.filter((t) => !t.ebay.blocker && t.ebay.receiving_id != null && !t.ebay.carton_touched
      && t.ebay.carton_other_lines === twins.filter((o) => o.ebay.receiving_id === t.ebay.receiving_id && o.ebay.id !== t.ebay.id && !o.ebay.blocker).length)
      .map((t) => t.ebay.receiving_id!),
  );
  console.log(`org ${orgId} · ${apply ? 'APPLY' : 'DRY RUN (read-only; --apply writes)'}`);
  console.log(`eBay lines with nothing received: ${ebay.length} · Zoho candidates: ${zoho.length}`);
  console.log(`\n== Twins (eBay line → its Zoho PO line): ${twins.length} across ${new Set(twins.map((t) => t.zoho.zoho_purchaseorder_id)).size} POs`);
  console.log('ebay_line  carton  order_id            → zoho_line carton  po#                 zoho_qty  reason        action');
  for (const t of twins) {
    if (!verbose && twins.indexOf(t) >= 40) break;
    const action = t.ebay.blocker
      ? `SKIP (${t.ebay.blocker})`
      : `link ebay→zoho, delete line${t.ebay.receiving_id != null && cartonsDeleted.has(t.ebay.receiving_id) ? ` + carton ${t.ebay.receiving_id}` : ' (carton kept)'}`;
    console.log(
      [
        String(t.ebay.id).padEnd(10),
        String(t.ebay.receiving_id ?? '-').padEnd(7),
        t.ebay.source_order_id.padEnd(19),
        '→',
        String(t.zoho.id).padEnd(9),
        String(t.zoho.receiving_id ?? '-').padEnd(7),
        t.zoho.zoho_purchaseorder_number.padEnd(19),
        `${t.zoho.quantity_received}`.padEnd(9),
        t.reason.padEnd(13),
        action,
      ].join(' '),
    );
  }
  if (!verbose && twins.length > 40) console.log(`… ${twins.length - 40} more (--verbose lists all)`);
  const byReason = twins.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.reason]: (acc[t.reason] ?? 0) + 1 }), {});
  console.log(`twins by reason: ${JSON.stringify(byReason)} · Zoho twin received: ${twins.filter((t) => t.zoho.quantity_received > 0).length}`);
  console.log(`twin tracking in scientific notation: ${twins.filter((t) => t.ebay.tracking_number && SCIENTIFIC_NOTATION_TRACKING.test(t.ebay.tracking_number)).length}`);
  console.log(`would delete: ${twins.length - blocked.length} lines, ${cartonsDeleted.size} cartons · skipped (physical activity): ${blocked.length}`);
  for (const t of blocked) console.log(`  skip line ${t.ebay.id}: ${t.ebay.blocker}`);

  const sciMirrorRecoverable = sciMirror.filter((m) => recovered.get(m.tracking_number.trim().toLowerCase()));
  const sciMirrorAskable = sciMirror.filter((m) => !recovered.get(m.tracking_number.trim().toLowerCase()) && m.po_date && Date.parse(m.po_date) >= askableSince);
  console.log(`\n== Scientific-notation tracking`);
  console.log(`shipments: ${sciShipments.length} (on ${sciShipments.reduce((n, s) => n + s.cartons, 0)} cartons) · true number recoverable from a stored tracking: ${sciShipments.filter((s) => recovered.get(s.tracking_number_raw.trim().toLowerCase())).length}`);
  console.log(`eBay mirror rows: ${sciMirror.length} · recoverable from a stored tracking: ${sciMirrorRecoverable.length} · else askable of eBay (placed ≤ ${GET_ORDERS_MAX_AGE_DAYS}d ago): ${sciMirrorAskable.length} · neither: ${sciMirror.length - sciMirrorRecoverable.length - sciMirrorAskable.length}`);
  for (const m of verbose ? sciMirror : sciMirror.slice(0, 15)) {
    const truth = recovered.get(m.tracking_number.trim().toLowerCase());
    const askable = m.po_date != null && Date.parse(m.po_date) >= askableSince;
    console.log(`  ${m.source_order_id.padEnd(19)} ${m.tracking_number.padEnd(24)} → ${truth ?? (askable ? `ask eBay (placed ${m.po_date}, account ${m.account ?? '?'})` : `lost (placed ${m.po_date ?? '?'})`)}`);
  }

  if (!apply) return;

  // ── --apply (operator-approved only) ───────────────────────────────────────
  let applied = 0;
  for (const t of twins) {
    if (t.ebay.blocker) continue;
    await withTenantTransaction(orgId as never, async (client) => {
      const tx = client as unknown as Parameters<typeof deleteInboundLinesInTx>[0];
      const live = await tx.query<{ blocker: string | null }>(
        `SELECT ${INBOUND_LINE_DELETE_BLOCKER_SQL} AS blocker FROM receiving_line rl
          WHERE rl.organization_id = $1 AND rl.id = $2 FOR UPDATE OF rl`,
        [orgId, t.ebay.id],
      );
      if (!live.rows[0] || live.rows[0].blocker) return;
      await upsertPurchaseLink(
        orgId as never,
        { receivingLineId: t.zoho.id, sourceType: 'ebay', sourceOrderId: t.ebay.source_order_id, sourceLineItemId: t.ebay.source_line_item_id, isPrimary: false },
        { withTx: (_o, fn) => fn(tx as never) },
      );
      await recordEquivalence(
        orgId as never,
        { sourceTypeA: 'ebay', sourceOrderIdA: t.ebay.source_order_id, sourceTypeB: 'zoho', sourceOrderIdB: t.zoho.zoho_purchaseorder_id, linkReason: t.reason as 'tracking' | 'order_number' },
        { query: (async (_o: unknown, sql: string, params?: ReadonlyArray<unknown>) => tx.query(sql, params)) as never },
      );
      await deleteInboundLinesInTx(tx, orgId as never, [t.ebay.id], t.ebay.receiving_id != null ? [t.ebay.receiving_id] : []);
      applied += 1;
    });
  }
  let mirrorFixed = 0;
  for (const m of sciMirrorRecoverable) {
    await withTenantTransaction(orgId as never, async (client) => {
      const r = await client.query(
        `UPDATE inbound_purchase_order_mirror SET tracking_number = $3, updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND tracking_number = $4`,
        [orgId, m.id, recovered.get(m.tracking_number.trim().toLowerCase()), m.tracking_number],
      );
      mirrorFixed += r.rowCount ?? 0;
    });
  }
  console.log(`\napplied: ${applied} twins retired · ${mirrorFixed} mirror tracking rows restored`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 50));
