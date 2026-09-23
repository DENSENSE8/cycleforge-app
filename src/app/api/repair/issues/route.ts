/**
 * GET/POST /api/repair/issues — the org's repair reason vocabulary.
 *
 * GET answers for a SKU STRING (`?sku=`), or for nothing (the globals). It used
 * to take `?favoriteSkuId=`, a `favorite_skus.id`, which only the favorites
 * rail could supply; that rail is gone (2026-09-16 — favorites are a scope of
 * the catalog picker now), and the intake form knows the SKU the operator
 * picked, not a curation row id. Resolving the anchor is `listSkuReasons`'
 * job, exactly as on the device twin (`/api/kiosk/repair/issues`), so both
 * principals read one vocabulary through one code path.
 *
 * POST still names the anchor by id: it is the staff CRUD desk
 * (Settings › Repair issues) writing globals (`favoriteSkuId: null`) or one
 * SKU's own row, and it already holds the id it is editing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createIssueTemplate, getIssuesForFavorite } from '@/lib/neon/repair-issue-queries';
import {
  isMissingRelationError,
  listSkuReasons,
  type SkuReasonDeps,
} from '@/lib/repair/sku-reasons';
import {
  ensureFavoriteSkuAnchor,
  findFavoriteSkuIdBySku,
} from '@/lib/favorites/sku-favorites';
import { withAuth, type AuthContext } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';

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

export const GET = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const sku = String(new URL(req.url).searchParams.get('sku') ?? '').trim();

    // No SKU: the management desk reading the GLOBAL templates, which it edits
    // by id — so it gets the full rows, not the label projection the pills use.
    if (!sku) {
      const issues = await getIssuesForFavorite(null, ctx.organizationId as OrgId);
      return NextResponse.json({ issues, count: issues.length });
    }

    const { favoriteSkuId, rows } = await listSkuReasons(
      ctx.organizationId as OrgId,
      sku,
      deps,
    );
    return NextResponse.json({
      issues: rows,
      labels: rows.map((row) => row.label),
      favoriteSkuId,
      count: rows.length,
    });
  } catch (error: unknown) {
    if (isMissingRelationError(error)) {
      // DB not migrated yet — ReasonSelector falls back to built-in defaults.
      return NextResponse.json({ issues: [], labels: [], favoriteSkuId: null, count: 0 });
    }
    console.error('GET /api/repair/issues error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch issues', details: message },
      { status: 500 },
    );
  }
}, { permission: 'repair.view' });

export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  try {
    const body = await req.json();
    const label = String(body?.label || '').trim();

    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const favoriteSkuId = body?.favoriteSkuId ? Number(body.favoriteSkuId) : null;
    if (favoriteSkuId !== null && (!Number.isFinite(favoriteSkuId) || favoriteSkuId <= 0)) {
      return NextResponse.json({ error: 'Invalid favoriteSkuId' }, { status: 400 });
    }

    const issue = await createIssueTemplate({
      favoriteSkuId,
      label,
      category: body?.category || null,
      sortOrder: body?.sortOrder ?? 0,
    }, ctx.organizationId as OrgId);

    return NextResponse.json({ success: true, issue });
  } catch (error: any) {
    console.error('POST /api/repair/issues error:', error);
    return NextResponse.json(
      { error: 'Failed to create issue template', details: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
}, { permission: 'repair.intake' });
