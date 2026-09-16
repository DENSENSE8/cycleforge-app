import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { isPlanFeatureExemptOrg } from '@/lib/billing/plan-feature-gate';
import { getIntegrationCredentials, type EcwidCredentials } from '@/lib/integrations/credentials';
import { cleanText, type CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { fetchEcwidCanonicalOrders } from '@/lib/orders/sources/ecwid-orders';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';

/**
 * POST /api/orders/backfill/ecwid-price
 *
 * One-time repair for the Ecwid orders that imported before the adapter carried
 * a price: the mapper hardcoded `saleAmount: null`, so 472 Ecwid orders landed
 * with no revenue at all. The adapter now emits a per-line amount, but the
 * recurring sync only looks at a rolling window — orders older than that window
 * would stay blank forever. This route re-reads the store and fills them in.
 *
 * It writes `sale_amount` ONLY where the column `IS NULL`, and the guard is in
 * the UPDATE itself rather than just the diagnosis read: an operator may have
 * corrected a price by hand between the two statements, and a marketplace
 * number must never overwrite a human's correction.
 *
 * `dryRun` defaults TRUE. A backfill that writes by default is a backfill that
 * writes before anyone has read what it would do.
 */

/** Ecwid orders fetched when the caller names no limit. Covers the 472 unpriced rows. */
const DEFAULT_LIMIT = 600;
const MAX_LIMIT = 2_000;
/** How many intended writes the dry run echoes back, so the numbers are checkable. */
const SAMPLE_SIZE = 10;

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
});

interface LocalOrderRow {
  id: number;
  order_id: string;
  sku: string | null;
  item_number: string | null;
  sale_amount: string | null;
}

/**
 * Which Ecwid line priced this local row.
 *
 * `orders` is one row per item, so a multi-item Ecwid order has several
 * candidate lines and picking the wrong one books another item's price. A
 * single-line order is unambiguous; otherwise the row's own sku must match, and
 * a row that matches nothing is left alone rather than guessed at.
 */
function pickLineForRow(
  candidates: CanonicalOrderLine[],
  row: LocalOrderRow,
): CanonicalOrderLine | null {
  if (candidates.length === 1) return candidates[0];
  const key = (cleanText(row.sku) || cleanText(row.item_number)).toUpperCase();
  if (!key) return null;
  return candidates.find((line) => cleanText(line.sku).toUpperCase() === key) ?? null;
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const dryRun = parsed.data.dryRun !== false;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  let lines: CanonicalOrderLine[];
  try {
    const vault = await getIntegrationCredentials<EcwidCredentials>(ctx.organizationId, 'ecwid');
    lines = await fetchEcwidCanonicalOrders(
      vault?.storeId && vault?.apiToken
        ? { storeId: vault.storeId, token: vault.apiToken }
        : undefined,
      {
        // The env credentials are the dogfood store's; every other tenant fails
        // closed rather than backfilling prices from someone else's shop.
        allowEnvFallback: isPlanFeatureExemptOrg(ctx.organizationId),
        // No date filter: the unpriced orders are historical, which is exactly
        // the slice the rolling sync window can never reach.
        window: { lookbackDays: null, limit },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Ecwid fetch failed';
    console.error('[orders/backfill/ecwid-price] Ecwid fetch failed:', message);
    return NextResponse.json({ error: 'ECWID_FETCH_FAILED', details: message }, { status: 502 });
  }

  const linesByOrderId = new Map<string, CanonicalOrderLine[]>();
  for (const line of lines) {
    const bucket = linesByOrderId.get(line.externalOrderId);
    if (bucket) bucket.push(line);
    else linesByOrderId.set(line.externalOrderId, [line]);
  }
  const orderIds = [...linesByOrderId.keys()];

  // Scoped to Ecwid-sourced rows, and NOT by order_id alone: an Ecwid order
  // number is a short integer, and this org has 57 `Other`, 28 unlabelled and
  // one Amazon order sharing that id shape. Matching on the id alone would
  // book an Ecwid price onto another channel's order. `account_source` is
  // free text and both 'ecwid' and 'ECWID' are in use, hence the fold.
  const local = orderIds.length
    ? await tenantQuery<LocalOrderRow>(
        ctx.organizationId,
        `SELECT id, order_id, sku, item_number, sale_amount
           FROM orders
          WHERE organization_id = $1
            AND order_id = ANY($2::text[])
            AND lower(btrim(coalesce(account_source, ''))) = 'ecwid'`,
        [ctx.organizationId, orderIds],
      )
    : { rows: [] as LocalOrderRow[] };

  const seenOrderIds = new Set<string>();
  const writes: Array<{ id: number; orderId: string; sku: string; saleAmount: string }> = [];
  let matched = 0;
  let skippedHasPrice = 0;
  let noSourcePrice = 0;
  let ambiguous = 0;

  for (const row of local.rows) {
    const candidates = linesByOrderId.get(row.order_id);
    if (!candidates) continue;
    seenOrderIds.add(row.order_id);

    const line = pickLineForRow(candidates, row);
    if (!line) {
      ambiguous++;
      continue;
    }
    matched++;
    if (row.sale_amount !== null) {
      skippedHasPrice++;
      continue;
    }
    if (line.saleAmount === null) {
      noSourcePrice++;
      continue;
    }
    writes.push({ id: row.id, orderId: row.order_id, sku: line.sku, saleAmount: line.saleAmount });
  }

  let updated = 0;
  if (!dryRun && writes.length > 0) {
    updated = await withTenantTransaction(ctx.organizationId, async (client) => {
      const res = await client.query(
        `UPDATE orders AS o
            SET sale_amount = v.amount
           FROM unnest($1::int[], $2::numeric[]) AS v(id, amount)
          WHERE o.id = v.id
            AND o.organization_id = $3
            AND o.sale_amount IS NULL
            AND lower(btrim(coalesce(o.account_source, ''))) = 'ecwid'`,
        [writes.map((w) => w.id), writes.map((w) => w.saleAmount), ctx.organizationId],
      );
      return res.rowCount ?? 0;
    });

    await recordAudit(pool, ctx, req, {
      source: 'orders-backfill-ecwid-price',
      action: AUDIT_ACTION.ORDER_UPDATE,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: `ecwid-price:${updated}`,
      method: 'system',
      extra: { updated, intended: writes.length, scanned: orderIds.length, limit },
    });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned: orderIds.length,
    matched,
    ...(dryRun ? { wouldUpdate: writes.length } : { updated }),
    skippedHasPrice,
    unmatched: orderIds.length - seenOrderIds.size,
    // A matched row whose Ecwid line carried no parseable price, and a row in a
    // multi-item order that matched no line by sku: both are left untouched.
    noSourcePrice,
    ambiguous,
    sample: writes.slice(0, SAMPLE_SIZE),
  });
}, { permission: 'orders.import' });
