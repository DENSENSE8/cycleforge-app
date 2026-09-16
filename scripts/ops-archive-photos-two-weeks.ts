/**
 * Two-week photo archive sweep (user-scoped): NAS-mirror every photo from the
 * last 14 days that lacks a NAS copy, then archive cartons with recent photos
 * into their linked support-ticket NAS folders (…/2 Zendesk 2026/<ticket#>/).
 *
 * Mirrors run locally (GCS read → NAS agent PUT → photo_storage row) using the
 * same job-queue semantics as runNasBackupBatch. Ticket-folder archives go
 * through the deployed site's POST /api/receiving/zendesk-claim/archive-only
 * (staff-7 station session, receiving.mark_received).
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-archive-photos-two-weeks.ts [--dry-run] [--days=14]
 */
import { config } from 'dotenv';

function kmsKeyLooksValid(): boolean {
  const raw = process.env.INTEGRATION_KMS_KEY ?? '';
  if (!raw) return false;
  try {
    return Buffer.from(raw, 'base64').length === 32;
  } catch {
    return false;
  }
}

if (!kmsKeyLooksValid()) {
  config({ path: '.env' });
  config({ path: '.env.local' });
}

import pool from '@/lib/db';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import {
  claimPendingJobs,
  completePhotoJob,
  enqueuePhotoJob,
  failPhotoJob,
} from '@/lib/photos/jobs';
import { runNasMirrorJob } from '@/lib/photos/mirror-nas';

const BASE = 'https://app.cycleforge.ai';
const STATION_LABEL = 'ops-archive-two-weeks';
const MIRROR_BATCH = 40;

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const DAYS = daysArg ? Number(daysArg.slice('--days='.length)) || 14 : 14;
const dryRun = process.argv.includes('--dry-run');

async function candidatesLastDays(): Promise<Array<{ photoId: number }>> {
  const res = await pool.query<{ id: number }>(
    `SELECT p.id
       FROM photos p
       WHERE p.organization_id = $1
         AND p.created_at >= NOW() - ($2::text)::interval
         AND NOT EXISTS (
           SELECT 1 FROM photo_storage s
            WHERE s.photo_id = p.id AND s.organization_id = p.organization_id AND s.provider = 'nas'
         )
       ORDER BY p.id`,
    [DOGFOOD_ORG_ID, `${DAYS} days`],
  );
  return res.rows.map((r) => ({ photoId: r.id }));
}

async function ticketCartonsLastDays(): Promise<
  Array<{ ticketNumber: string; receivingId: number; photos: number; newest: string }>
> {
  const res = await pool.query(
    `SELECT st.external_ticket_id AS ticket_number,
            tl.entity_id::int AS receiving_id,
            count(DISTINCT p.id)::int AS photos,
            max(p.created_at)::text AS newest
       FROM ticket_links tl
       JOIN support_tickets st
         ON st.id = tl.support_ticket_id AND st.organization_id = tl.organization_id
       JOIN photo_entity_links pel
         ON pel.organization_id = tl.organization_id
        AND pel.entity_type = 'RECEIVING'
        AND pel.entity_id = tl.entity_id
       JOIN photos p
         ON p.id = pel.photo_id AND p.organization_id = pel.organization_id
      WHERE tl.organization_id = $1
        AND tl.entity_type = 'RECEIVING'
        AND p.created_at >= NOW() - ($2::text)::interval
      GROUP BY 1, 2
      ORDER BY newest DESC`,
    [DOGFOOD_ORG_ID, `${DAYS} days`],
  );
  return res.rows.map(
    (r: { ticket_number: string; receiving_id: number; photos: number; newest: string }) => ({
      ticketNumber: String(r.ticket_number),
      receivingId: Number(r.receiving_id),
      photos: r.photos,
      newest: r.newest,
    }),
  );
}

async function main() {
  console.log(`ops-archive-photos-two-weeks — last ${DAYS} days${dryRun ? ' (DRY RUN)' : ''}\n`);

  const mirrorTargets = await candidatesLastDays();
  console.log(`photos needing NAS mirror: ${mirrorTargets.length}`);

  const ticketTargets = await ticketCartonsLastDays();
  console.log(`ticket-linked cartons with recent photos: ${ticketTargets.length}`);
  for (const t of ticketTargets) {
    console.log(`  ticket ${t.ticketNumber} · carton ${t.receivingId} · ${t.photos} photo(s) · newest ${String(t.newest).slice(0, 16)}`);
  }

  if (dryRun) return;

  // ── Part 1: NAS mirror, same queue semantics as the site batch ──────────
  let mirrored = 0;
  let already = 0;
  let failed = 0;
  for (let i = 0; i < mirrorTargets.length; i += MIRROR_BATCH) {
    const slice = mirrorTargets.slice(i, i + MIRROR_BATCH);
    for (const c of slice) {
      await enqueuePhotoJob({
        photoId: c.photoId,
        organizationId: DOGFOOD_ORG_ID,
        jobType: 'nas_mirror',
      }).catch(() => {});
    }
    const jobs = await claimPendingJobs('nas_mirror', MIRROR_BATCH);
    for (const job of jobs) {
      if (job.organizationId !== DOGFOOD_ORG_ID) continue;
      try {
        await runNasMirrorJob(job);
        await completePhotoJob(job.id);
        mirrored += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(msg)) {
          already += 1;
          await completePhotoJob(job.id).catch(() => {});
        } else {
          failed += 1;
          console.warn(`  mirror photo ${job.photoId} failed: ${msg.slice(0, 120)}`);
          await failPhotoJob(job.id, msg, job.attempts).catch(() => {});
        }
      }
    }
    console.log(`mirror progress: ${Math.min(i + MIRROR_BATCH, mirrorTargets.length)}/${mirrorTargets.length} (mirrored=${mirrored} already=${already} failed=${failed})`);
  }

  // ── Part 2: ticket-folder archives via the deployed site ────────────────
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'x-tenant-slug': 'usav' },
    body: JSON.stringify({ staffId: 7, deviceKind: 'station', deviceLabel: STATION_LABEL }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter((c) => c.startsWith('cf_sid='))
    .join('; ');
  if (!cookie) throw new Error('site signin failed');
  const hdr = { cookie, origin: BASE, 'x-tenant-slug': 'usav', 'content-type': 'application/json' };

  for (const t of ticketTargets) {
    const r = await fetch(`${BASE}/api/receiving/zendesk-claim/archive-only`, {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({
        ticketNumber: String(t.ticketNumber).replace(/^#/, ''),
        receivingId: t.receivingId,
        subject: 'Two-week photo archive sweep',
        reason: 'Ops sweep: photos from the last 2 weeks archived to the ticket folder',
      }),
    });
    const b = (await r.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      archived?: { copied?: number; total?: number; folder?: string | null };
    };
    console.log(
      `ticket ${t.ticketNumber}: ${r.status} ok=${b.success !== false} copied=${b.archived?.copied ?? '—'}/${b.archived?.total ?? '—'} ${b.error || ''}`,
    );
    await new Promise((r2) => setTimeout(r2, 3000));
  }

  const left = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM photos p
      WHERE p.organization_id = $1 AND p.created_at >= NOW() - ($2::text)::interval
        AND NOT EXISTS (SELECT 1 FROM photo_storage s WHERE s.photo_id = p.id AND s.organization_id = p.organization_id AND s.provider = 'nas')`,
    [DOGFOOD_ORG_ID, `${DAYS} days`],
  );
  console.log(`\nsummary: mirrored=${mirrored} already=${already} failed=${failed} · still-unmirrored-in-window=${left.rows[0]?.n ?? '?'}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
