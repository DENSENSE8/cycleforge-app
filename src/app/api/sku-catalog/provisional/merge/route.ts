import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { ProvisionalMergeBody } from '@/lib/schemas/provisional-sku';
import { mergeProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { publishSkuExceptionChanged, publishStockLedgerEvent } from '@/lib/realtime/publish';

/** The override: */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organization' }, { status: 403 });
    }

    const parsed = parseBody(ProvisionalMergeBody, await req.json().catch(() => null));
    if (parsed instanceof NextResponse) return parsed;

    let result;
    try {
      result = await mergeProvisionalSku(
        {
          provisionalSku: parsed.provisionalSku,
          targetSku: parsed.targetSku,
          staffId: parsed.staffId ?? ctx.staffId ?? null,
        },
        orgId,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merge failed';
      // A placeholder that is not there is a 404; a refused pairing (chaining
      // TMP→TMP, merging a real SKU) is the caller asking for something the
      // model does not allow, which is a 409, not a validation error.
      const status = message.startsWith('No on-hold product') ? 404 : 409;
      return NextResponse.json({ success: false, error: message }, { status });
    }

    await recordAudit(pool, ctx, req, {
      source: 'web',
      action: AUDIT_ACTION.SKU_STOCK_ADJUST,
      entityType: AUDIT_ENTITY.SKU_STOCK,
      entityId: parsed.targetSku,
      before: { sku: parsed.provisionalSku },
      after: { sku: parsed.targetSku },
      reasonCode: 'PROVISIONAL_MERGE',
      actorStaffIdOverride: parsed.staffId ?? ctx.staffId ?? null,
      extra: {
        qty_moved: result.qtyMoved,
        bin_rows_moved: result.binRowsMoved,
        ledger_rows_rekeyed: result.ledgerRowsRekeyed,
        photos_moved: result.photosMoved,
      },
    });

    // The merge DELETED the placeholder's `sku_catalog` row and may have minted a `sku_stock` row for the target.
    await invalidateCacheTags(orgId, [CACHE_TAGS.skuCatalog]);

    // Realtime: a merge MOVES stock between two keys — bin rows folded or re-keyed, the whole ledger history re-filed — without going through…
    if (result.feedLedgerId != null) {
      try {
        await publishStockLedgerEvent({
          organizationId: orgId,
          ledgerId: result.feedLedgerId,
          sku: parsed.provisionalSku,
          delta: -result.qtyMoved,
          reason: 'MERGED',
          dimension: 'WAREHOUSE',
          staffId: parsed.staffId ?? ctx.staffId ?? null,
          source: 'provisional.merge',
        });
      } catch (err) {
        console.warn('[provisional/merge] realtime publish failed', err);
      }
    }

    // The SKU Exceptions queues drop the row even when no stock moved.
    after(() =>
      publishSkuExceptionChanged({
        organizationId: orgId,
        sku: parsed.provisionalSku,
        action: 'merged',
        targetSku: parsed.targetSku,
        source: 'sku-catalog.provisional.merge',
      }),
    );
    return NextResponse.json({ success: true, ...result });
  },
  { permission: 'sku_stock.manage' },
);
