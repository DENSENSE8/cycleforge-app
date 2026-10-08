import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { CONDITION_GRADES } from '@/lib/conditions';
import { publishFbaCatalogChanged } from '@/lib/realtime/publish';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { requireRoutePerm, recordRouteAudit } from '@/lib/auth/dynamic-route-guard';

/**
 * POST /api/qc/fnsku-pair — the /test dock's Pair: bind an FNSKU to an
 * inventory SKU at one house grade (`fba_fnskus.sku_catalog_id` +
 * `paired_condition_grade`). One SKU holds many FNSKUs, one per grade; pairing
 * a grade that already has an FNSKU replaces it (the old one is unbound from
 * the grade, keeping its SKU), in one transaction. An FNSKU paired to a
 * different SKU answers 409 — one FNSKU, one inventory SKU.
 */
const PairBody = z.object({
  fnsku: z.string().trim().min(1).max(64),
  sku_catalog_id: z.number().int().positive(),
  condition_grade: z.enum(CONDITION_GRADES),
});

type PairOutcome =
  | { kind: 'ok'; fnsku: string; replaced: string | null }
  | { kind: 'not_found'; what: 'catalog' | 'fnsku' }
  | { kind: 'taken'; pairedTo: number };

export async function POST(request: NextRequest) {
  try {
    const gate = await requireRoutePerm(request, 'tech.qc_pass');
    if (gate.denied) return gate.denied;

    const parsed = PairBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
    }
    const fnsku = parsed.data.fnsku.toUpperCase();
    const { sku_catalog_id: skuCatalogId, condition_grade: grade } = parsed.data;
    const orgId = gate.ctx.organizationId;

    const outcome = await withTenantTransaction<PairOutcome>(orgId, async (client) => {
      const catalog = await client.query(
        `SELECT 1 FROM sku_catalog WHERE id = $1 AND organization_id = $2`,
        [skuCatalogId, orgId],
      );
      if (catalog.rowCount === 0) return { kind: 'not_found', what: 'catalog' };

      const target = await client.query<{ sku_catalog_id: number | null }>(
        `SELECT sku_catalog_id FROM fba_fnskus WHERE fnsku = $1 AND organization_id = $2 FOR UPDATE`,
        [fnsku, orgId],
      );
      if (target.rowCount === 0) return { kind: 'not_found', what: 'fnsku' };
      const pairedTo = target.rows[0].sku_catalog_id;
      if (pairedTo != null && pairedTo !== skuCatalogId) return { kind: 'taken', pairedTo };

      // The grade's previous FNSKU keeps its SKU; only the grade binding moves.
      const replaced = await client.query<{ fnsku: string }>(
        `UPDATE fba_fnskus
            SET paired_condition_grade = NULL, updated_at = now()
          WHERE organization_id = $1 AND sku_catalog_id = $2
            AND paired_condition_grade = $3::condition_grade_enum AND fnsku <> $4
          RETURNING fnsku`,
        [orgId, skuCatalogId, grade, fnsku],
      );
      await client.query(
        `UPDATE fba_fnskus
            SET sku_catalog_id = $3, paired_condition_grade = $4::condition_grade_enum, updated_at = now()
          WHERE fnsku = $1 AND organization_id = $2`,
        [fnsku, orgId, skuCatalogId, grade],
      );
      return { kind: 'ok', fnsku, replaced: replaced.rows[0]?.fnsku ?? null };
    });

    if (outcome.kind === 'not_found') {
      return NextResponse.json(
        { ok: false, error: outcome.what === 'catalog' ? 'catalog row not found' : 'FNSKU not found' },
        { status: 404 },
      );
    }
    if (outcome.kind === 'taken') {
      return NextResponse.json(
        { ok: false, error: `${fnsku} is already paired to another SKU`, paired_to: outcome.pairedTo },
        { status: 409 },
      );
    }

    await invalidateCacheTags(['fba-fnskus']);
    await invalidateCacheTags(orgId, [CACHE_TAGS.fbaBoard, CACHE_TAGS.fbaToday, CACHE_TAGS.fbaStageCounts]);
    await publishFbaCatalogChanged({ action: 'updated', fnsku, source: 'qc.fnsku-pair', organizationId: orgId });

    const response = NextResponse.json({
      ok: true,
      fnsku,
      sku_catalog_id: skuCatalogId,
      condition_grade: grade,
      replaced: outcome.replaced,
    });
    await recordRouteAudit(request, gate.ctx, response, {
      source: 'qc.fnsku-pair',
      action: 'qc.fnsku.pair',
      entityType: 'fba_fnsku',
      entityId: () => fnsku,
    });
    return response;
  } catch (error) {
    console.error('[POST /api/qc/fnsku-pair]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'pair failed' },
      { status: 500 },
    );
  }
}
