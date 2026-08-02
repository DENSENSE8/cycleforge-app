import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { readEntitySignals } from '@/lib/surfaces/entity-signals-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/entity-signals — the org's entity_signals spine for the history
 * surfaces (universal-feed plan Phase 5). Newest-first, org-scoped (never
 * cross-tenant). Query params: ?limit ?sinceDays ?signalKind ?entityType ?entityId ?q
 * (full-text over notes_tsv). `entityId` (with `entityType`) narrows to one
 * record's signals — the History→Signals related strip.
 *
 * Failure class: **SUB-RESOURCE.** A Monitor sub-resource must never 500 the
 * page, so a throw keeps 200 — but it carries `degraded: true` + `error` so the
 * strip can render the degraded state instead of the "no signals yet" teaching
 * empty. Silently reusing `[]` for both is the failure that took sign-in down
 * on 2026-08-01 (see /api/auth/staff-picker).
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const sp = new URL(req.url).searchParams;
    const num = (v: string | null): number | null => {
      const n = Number(v);
      return v != null && Number.isFinite(n) ? n : null;
    };
    try {
      const signals = await readEntitySignals(ctx.organizationId, {
        limit: num(sp.get('limit')) ?? 200,
        sinceDays: num(sp.get('sinceDays')),
        signalKind: sp.get('signalKind'),
        entityType: sp.get('entityType'),
        entityId: num(sp.get('entityId')),
        q: sp.get('q'),
      });
      return NextResponse.json({ success: true, signals });
    } catch (error) {
      console.error('[GET /api/entity-signals]', error);
      return NextResponse.json({
        success: true,
        signals: [],
        degraded: true,
        error: 'entity_signals_unavailable',
      });
    }
  },
  { permission: 'operations.view' },
);
