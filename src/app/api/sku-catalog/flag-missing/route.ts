/** POST /api/sku-catalog/flag-missing */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SkuCatalogFlagMissingBody } from '@/lib/schemas/sku-catalog';
import { queuePendingSku } from '@/lib/inventory/pending-skus';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { withTenantTransaction } from '@/lib/tenancy/db';

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(SkuCatalogFlagMissingBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    // Tenant GUC: run both the pending-sku enqueue and the audit write on the tenant client so they execute under `app.current_org`…
    const pending = await withTenantTransaction(ctx.organizationId, async (client) => {
      const row = await queuePendingSku(
        {
          rawSku: parsed.sku,
          source: parsed.source ?? 'scan',
          suggestedTitle: parsed.suggestedTitle ?? null,
        },
        client,
      );
      if (!row) return null;

      await recordAudit(client, ctx, req, {
        source: 'sku-catalog-flag-missing',
        action: AUDIT_ACTION.SKU_CATALOG_FLAG_MISSING,
        entityType: AUDIT_ENTITY.SKU,
        entityId: row.id,
        before: null,
        after: {
          normalized_sku: row.normalized_sku,
          raw_sku: row.raw_sku,
          status: row.status,
          occurrences: row.occurrences,
          suggested_title: row.suggested_title,
        },
      });
      return row;
    });

    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'sku is required' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, pending }, { status: 201 });
  },
  { permission: 'sku_stock.manage' },
);
