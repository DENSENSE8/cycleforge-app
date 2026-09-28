import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { previewListingAssignees } from '@/lib/automations/apply-listing-assignment';
import type { OrgId } from '@/lib/tenancy/constants';
import { getStaffNameMap } from '@/lib/work-assignments/order-assignment-snapshot';

export const dynamic = 'force-dynamic';

const Body = z.object({
  channel: z.string().trim().max(120).optional(),
  lines: z
    .array(
      z.object({
        skuCatalogId: z.number().int().positive().nullable(),
        sku: z.string().trim().max(100).nullable(),
        itemNumber: z.string().trim().max(120).nullable(),
      }),
    )
    .max(50),
});

/**
 * POST /api/orders/intake/assignees { channel?, lines: [{ skuCatalogId, sku, itemNumber }] }
 * → { ok, results: [{ rule: { id, name } | null, picker, packer }] } — per line,
 * the listing → staff rule the automation would run on import and who it puts
 * on PICK / PACK today (backup when the primary is out). Read-only; the
 * new-order form shows it as the default and lets the operator override.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'lines are required' }, { status: 400 });
  const previews = await previewListingAssignees(
    ctx.organizationId as OrgId,
    parsed.data.lines.map((l) => ({
      sku_catalog_id: l.skuCatalogId,
      sku: l.sku,
      item_number: l.itemNumber,
      account_source: parsed.data.channel ?? null,
    })),
  );
  const names = await getStaffNameMap(previews.flatMap((p) => [p?.pick?.staffId, p?.pack?.staffId]));
  const person = (a: { staffId: number; via: 'primary' | 'backup' } | null | undefined) =>
    a ? { id: a.staffId, name: names.get(a.staffId) ?? `Staff ${a.staffId}`, via: a.via } : null;
  return NextResponse.json({
    ok: true,
    results: previews.map((p) => ({
      rule: p ? { id: p.ruleId, name: p.ruleName } : null,
      picker: person(p?.pick),
      packer: person(p?.pack),
    })),
  });
}, { permission: 'orders.create' });
