/**
 * Receiving sidebar-rail first-paint seed — the Upstash-backed replacement for
 * the old browser-`localStorage` rail snapshot.
 *
 *   GET  ?feed=<feedParam>          → the viewer's last-known rows for that rail
 *   POST { feed, rows }             → store the rows the rail just rendered
 *
 * Seed-only cache: a rail POSTs the rows it is showing, and on the next reload
 * GETs them to paint immediately while the (heavy) authoritative
 * `/api/receiving-lines` query resolves and reconciles over the seed. Because it
 * is only ever a transient seed — replaced by the authoritative fetch within one
 * round-trip — there is no audit, no domain mutation, and no invalidation
 * plumbing: a stale or missing seed self-heals. Keyed per org + viewer so a
 * shared terminal never seeds one staffer from another's rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { getCachedJson, setCachedJson } from '@/lib/cache/upstash-cache';
import { isRedisCacheEnabled } from '@/lib/cache/cache-flags';
import { CACHE_NS } from '@/lib/cache/tags';
import {
  RAIL_SNAPSHOT_MAX_ROWS,
  RAIL_SNAPSHOT_TTL_SECONDS,
  railSnapshotCacheKey,
} from '@/lib/receiving/rail/rail-snapshot-cache';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** The client-composed feed identity (feedId:scope:staffFilter) — bounded charset. */
const FEED_PARAM = z.string().min(1).max(200).regex(/^[A-Za-z0-9:_.-]+$/);

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const feed = FEED_PARAM.safeParse(new URL(request.url).searchParams.get('feed') ?? '');
    if (!feed.success) {
      return NextResponse.json({ success: false, error: 'INVALID_FEED' }, { status: 400 });
    }
    if (!isRedisCacheEnabled()) {
      return NextResponse.json({ success: true, rows: [], cached: false });
    }
    const key = railSnapshotCacheKey(feed.data, ctx.staffId);
    const rows = await getCachedJson<ReceivingLineRow[]>(
      CACHE_NS.receivingRail,
      ctx.organizationId,
      key,
    );
    return NextResponse.json({ success: true, rows: rows ?? [], cached: rows != null });
  },
  { permission: 'receiving.view' },
);

// Rows are the viewer's own already-rendered rail rows. Validate only the shape
// we depend on (a numeric `id`) and cap the count — this is a per-viewer seed,
// never a shared read model, so a bad write only affects the writer's own
// transient first paint.
const POST_BODY = z.object({
  feed: FEED_PARAM,
  rows: z.array(z.object({ id: z.number() }).passthrough()).max(RAIL_SNAPSHOT_MAX_ROWS * 3),
});

/** Generous ceiling for ~30 rendered rows; rejects a pathological body early. */
const MAX_BODY_BYTES = 512_000;

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const declaredLen = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'BODY_TOO_LARGE' }, { status: 413 });
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'BAD_JSON' }, { status: 400 });
    }
    const parsed = POST_BODY.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400 });
    }
    if (!isRedisCacheEnabled()) {
      return NextResponse.json({ success: true, stored: 0 });
    }
    const key = railSnapshotCacheKey(parsed.data.feed, ctx.staffId);
    const rows = parsed.data.rows.slice(0, RAIL_SNAPSHOT_MAX_ROWS) as unknown as ReceivingLineRow[];
    // Never overwrite a good per-viewer seed with []. Transient empty rail
    // refetches must not poison the next reload's first paint.
    if (rows.length === 0) {
      return NextResponse.json({ success: true, stored: 0 });
    }
    // Belt-and-suspenders on the actual payload (content-length can be absent or
    // spoofed): the row objects are `.passthrough()`, so cap the serialized size.
    const serialized = JSON.stringify(rows);
    if (serialized.length > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'BODY_TOO_LARGE' }, { status: 413 });
    }
    // No cache tag: this is a TTL-only per-viewer seed, reconciled by the
    // authoritative fetch on every mount, so no writer needs to invalidate it.
    await setCachedJson(
      CACHE_NS.receivingRail,
      ctx.organizationId,
      key,
      rows,
      RAIL_SNAPSHOT_TTL_SECONDS,
    );
    return NextResponse.json({ success: true, stored: rows.length });
  },
  { permission: 'receiving.view' },
);
