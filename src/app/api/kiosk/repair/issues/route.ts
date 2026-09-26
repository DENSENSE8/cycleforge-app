/**
 * GET/POST /api/kiosk/repair/issues — repair reason vocabulary for a SKU, as the front-desk tablet can reach it.
 * A device may add a reason for the SKU in front of it (operator 2026-09-14),
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withKioskAuth } from '@/lib/auth/withKioskAuth';
import {
  createIssueTemplate,
  getIssuesForFavorite,
} from '@/lib/neon/repair-issue-queries';
import {
  ensureFavoriteSkuAnchor,
  findFavoriteSkuIdBySku,
} from '@/lib/favorites/sku-favorites';
import {
  addSkuReason,
  isMissingRelationError,
  listSkuReasons,
  SKU_REASON_LABEL_MAX,
  type SkuReasonDeps,
} from '@/lib/repair/sku-reasons';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';

const deps: SkuReasonDeps = {
  findFavoriteSkuId: (sku, orgId) => findFavoriteSkuIdBySku(sku, orgId),
  ensureFavoriteSkuId: (input, orgId) => ensureFavoriteSkuAnchor(input, orgId),
  listIssues: (favoriteSkuId, orgId) => getIssuesForFavorite(favoriteSkuId, orgId),
  createIssue: (input, orgId) =>
    createIssueTemplate(
      { favoriteSkuId: input.favoriteSkuId, label: input.label, sortOrder: input.sortOrder },
      orgId,
    ),
};

export const GET = withKioskAuth(async (req: NextRequest, ctx) => {
  const sku = req.nextUrl.searchParams.get('sku');
  try {
    const { favoriteSkuId, rows } = await listSkuReasons(
      ctx.organizationId as OrgId,
      sku,
      deps,
    );
    return NextResponse.json({
      issues: rows,
      labels: rows.map((r) => r.label),
      favoriteSkuId,
      count: rows.length,
    });
  } catch (error: unknown) {
    if (isMissingRelationError(error)) {
      // Table not migrated on this DB — the pills fall back to the built-in
      // registry, same contract as the staff route.
      return NextResponse.json({ issues: [], labels: [], favoriteSkuId: null, count: 0 });
    }
    throw error; // withKioskAuth's error floor returns JSON, not a bodyless 500.
  }
});

const BodySchema = z.object({
  sku: z.string().trim().min(1).max(255),
  label: z.string().trim().min(1).max(SKU_REASON_LABEL_MAX),
  /** Display name of the catalog item, used when the SKU needs an anchor row. */
  productLabel: z.string().trim().max(255).optional(),
});

export const POST = withKioskAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await addSkuReason(ctx.organizationId as OrgId, parsed.data, deps);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, issue: result.row }, { status: 201 });
});
