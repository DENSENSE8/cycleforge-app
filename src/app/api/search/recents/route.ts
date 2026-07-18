/**
 * /api/search/recents — the signed-in staffer's most-recently-searched history
 * (Dashboard Search mode sidebar). Per-staff, cross-device, DB-backed
 * (`search_recents`). `orgId`/`staffId` come from the verified session (`ctx`),
 * never the body.
 *
 *   GET                       → newest-first list (optional `?scope=`, `?limit=`)
 *   POST { query, scope?, … } → MRU-record a query; returns the fresh list
 *   DELETE ?id=<n>            → remove one recent; returns the fresh list
 *   DELETE (no id, ?scope=?)  → clear all (optionally one scope)
 *
 * No audit log: this is a personal, high-frequency MRU preference store (like a
 * recents cache), not a domain mutation — auditing every keystroke-search would
 * be pure noise. It carries no tenant-crossing risk (org/staff from `ctx`,
 * tenant-scoped writes via `withTenantTransaction` inside the domain helper).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  listStaffRecents,
  pushStaffRecent,
  removeStaffRecent,
  clearStaffRecents,
} from '@/lib/search/staff-recents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (req, ctx) => {
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || undefined;
    const limitRaw = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const recents = await listStaffRecents(ctx.organizationId, ctx.staffId, { scope, limit });
    return NextResponse.json({ recents });
  },
  { permission: 'dashboard.view' },
);

export const POST = withAuth(
  async (req, ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const query = typeof b.query === 'string' ? b.query.trim() : '';
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    // Only accept a top-hit that actually has the shape we store — a malformed
    // object never lands in the jsonb column.
    const th = b.topHit as Record<string, unknown> | undefined;
    const topHit =
      th && typeof th === 'object' &&
      typeof th.title === 'string' &&
      typeof th.href === 'string' &&
      typeof th.entityType === 'string'
        ? { title: th.title, href: th.href, entityType: th.entityType }
        : undefined;

    const recents = await pushStaffRecent(ctx.organizationId, ctx.staffId, {
      query,
      scope: typeof b.scope === 'string' ? b.scope.slice(0, 64) : undefined,
      scopeLabel: typeof b.scopeLabel === 'string' ? b.scopeLabel.slice(0, 64) : undefined,
      scopeHref: typeof b.scopeHref === 'string' ? b.scopeHref.slice(0, 512) : undefined,
      resultCount: typeof b.resultCount === 'number' ? b.resultCount : undefined,
      topHit,
    });
    return NextResponse.json({ recents });
  },
  { permission: 'dashboard.view' },
);

export const DELETE = withAuth(
  async (req, ctx) => {
    const url = new URL(req.url);
    const idRaw = url.searchParams.get('id');
    if (idRaw != null) {
      const id = Number(idRaw);
      if (!Number.isFinite(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
      const recents = await removeStaffRecent(ctx.organizationId, ctx.staffId, id);
      return NextResponse.json({ recents });
    }
    const scope = url.searchParams.get('scope') || undefined;
    await clearStaffRecents(ctx.organizationId, ctx.staffId, scope);
    return NextResponse.json({ recents: [] });
  },
  { permission: 'dashboard.view' },
);
