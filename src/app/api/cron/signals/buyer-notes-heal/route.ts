/** Nightly heal sweep for buyer-note signal derivation (plan §2.3 heal path). */
import { NextResponse, type NextRequest } from 'next/server';
import pool from '@/lib/db';
import { EBAY_PLATFORM_PREDICATE } from '@/lib/ebay/credentials';
import { isAuthorizedCronRequest, unauthorizedCronResponse } from '@/lib/cron/auth';
import { withCronLock } from '@/lib/cron/lock';
import { withCronRun } from '@/lib/cron/run-log';
import type { OrgId } from '@/lib/tenancy/constants';
import { deriveBuyerNoteSignals } from '@/lib/surfaces/buyer-note-derivation';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB = 'signals.buyer_notes_heal';

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers)) return unauthorizedCronResponse();

  const limitParam = Number(request.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 10_000) : 5_000;

  try {
    const locked = await withCronLock(JOB, () =>
      withCronRun(JOB, async () => {
        const { rows } = await pool.query<{ organization_id: string }>(
          `SELECT DISTINCT organization_id FROM ebay_accounts
            WHERE is_active = true AND ${EBAY_PLATFORM_PREDICATE}`,
        );

        let orgsEnabled = 0;
        let emitted = 0;
        let duplicates = 0;
        let failed = 0;
        for (const row of rows) {
          const result = await deriveBuyerNoteSignals(row.organization_id as OrgId, { limit });
          if (!result.enabled) continue;
          orgsEnabled += 1;
          emitted += result.emitted;
          duplicates += result.duplicates;
          failed += result.failed;
        }

        return { orgsConnected: rows.length, orgsEnabled, emitted, duplicates, failed, limit };
      }),
    );
    if (!locked.ran) return NextResponse.json({ success: true, skipped: 'locked' });
    return NextResponse.json({ success: true, ...locked.result! });
  } catch (error) {
    console.error('[cron/signals.buyer_notes_heal]', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
