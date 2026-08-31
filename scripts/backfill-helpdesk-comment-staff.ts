#!/usr/bin/env node
/**
 * Stamp Cycle Forge staff onto historical Zendesk comments that were filed
 * from this app (they currently show the shared Zendesk manager / API user).
 *
 * What we use (in order):
 *   1. Opening comment ← support_tickets.created_by / ticket_links.created_by
 *      when that comment is not the customer requester.
 *   2. Later internal notes signed `— {staffName}` (composer sign-off) when
 *      that name uniquely matches one staff row in the org.
 *
 * Customer comments and unsigned Zendesk-native agent comments are left alone.
 *
 *   npx tsx scripts/backfill-helpdesk-comment-staff.ts            # dry run
 *   npx tsx scripts/backfill-helpdesk-comment-staff.ts --apply
 *   npx tsx scripts/backfill-helpdesk-comment-staff.ts --apply --days=90 --limit=50
 */

import path from 'node:path';
import Module from 'node:module';
import { config as loadEnv } from 'dotenv';

// Next's `server-only` package throws outside a Server Component. This job is
// a CLI that reuses those modules — stub the guard before they load.
type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleInternals = Module as unknown as { _load: ModuleLoad };
const origLoad = moduleInternals._load;
moduleInternals._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return origLoad.call(this, request, parent, isMain);
};

loadEnv({ path: path.resolve('.env'), quiet: true });
loadEnv({ path: path.resolve('.env.local'), override: false, quiet: true });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const daysArg = args.find((a) => a.startsWith('--days='));
const limitArg = args.find((a) => a.startsWith('--limit='));
const orgArg = args.find((a) => a.startsWith('--org='));
const DAYS = daysArg ? Number(daysArg.slice('--days='.length)) : 180;
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
const ONLY_ORG = orgArg ? orgArg.slice('--org='.length) : null;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { Pool } = await import('pg');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=') ? { rejectUnauthorized: false } : undefined,
  });

  const { getHelpdeskProvider } = await import('@/lib/integrations/helpdesk');
  const { recordHelpdeskCommentStaff } = await import(
    '@/lib/integrations/helpdesk/comment-staff'
  );
  const { staffNameFromNoteSignature } = await import(
    '@/lib/integrations/helpdesk/comment-staff-identity'
  );

  const params: unknown[] = [];
  const where: string[] = [
    `st.provider = 'zendesk'`,
    `st.external_ticket_id ~ '^[0-9]+$'`,
    `COALESCE(st.created_by, tl.created_by) IS NOT NULL`,
    `NOT EXISTS (
       SELECT 1 FROM helpdesk_comment_staff h
        WHERE h.organization_id = st.organization_id
          AND h.zendesk_ticket_id = st.external_ticket_id::bigint
     )`,
  ];
  if (ONLY_ORG) {
    params.push(ONLY_ORG);
    where.push(`st.organization_id = $${params.length}`);
  }
  if (Number.isFinite(DAYS) && DAYS > 0) {
    params.push(DAYS);
    where.push(`st.created_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
  }

  let sql = `
    SELECT
      st.organization_id,
      st.external_ticket_id::bigint AS zendesk_ticket_id,
      COALESCE(st.created_by, tl.created_by) AS staff_id
    FROM support_tickets st
    LEFT JOIN LATERAL (
      SELECT created_by
        FROM ticket_links
       WHERE organization_id = st.organization_id
         AND support_ticket_id = st.id
         AND created_by IS NOT NULL
       ORDER BY created_at ASC
       LIMIT 1
    ) tl ON true
    WHERE ${where.join('\n      AND ')}
    ORDER BY st.created_at DESC
  `;
  if (LIMIT > 0) {
    params.push(LIMIT);
    sql += ` LIMIT $${params.length}`;
  }

  const { rows } = await pool.query<{
    organization_id: string;
    zendesk_ticket_id: string;
    staff_id: number;
  }>(sql, params);

  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} — ${rows.length} ticket(s)` +
      (DAYS > 0 ? `, last ${DAYS}d` : ', all dates') +
      (ONLY_ORG ? `, org ${ONLY_ORG}` : ''),
  );

  let stamped = 0;
  let skipped = 0;
  let errors = 0;

  const staffByOrg = new Map<string, Map<string, number>>();
  const helpdeskByOrg = new Map<string, Awaited<ReturnType<typeof getHelpdeskProvider>>>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const ticketId = Number(row.zendesk_ticket_id);
    const staffId = Number(row.staff_id);
    const orgId = row.organization_id;
    process.stdout.write(`  [${i + 1}/${rows.length}] #${ticketId}…`);
    try {
      let helpdesk = helpdeskByOrg.get(orgId);
      if (helpdesk === undefined) {
        helpdesk = await getHelpdeskProvider(orgId);
        helpdeskByOrg.set(orgId, helpdesk);
      }
      if (!helpdesk || !(await helpdesk.isConfigured())) {
        skipped += 1;
        process.stdout.write(' skip (no helpdesk)\n');
        continue;
      }

      const listed = await helpdesk.listComments(ticketId, { perPage: 100 });
      const comments = listed.comments ?? [];
      if (!comments.length) {
        skipped += 1;
        process.stdout.write(' skip (no comments)\n');
        continue;
      }

      if (!staffByOrg.has(orgId)) {
        const staffRes = await pool.query<{ id: number; name: string }>(
          `SELECT id, name FROM staff WHERE organization_id = $1 AND active IS NOT FALSE`,
          [orgId],
        );
        const byName = new Map<string, number>();
        const counts = new Map<string, number>();
        for (const s of staffRes.rows) {
          const key = s.name.trim().toLowerCase();
          if (!key) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          byName.set(key, s.id);
        }
        for (const [key, n] of counts) {
          if (n > 1) byName.delete(key);
        }
        staffByOrg.set(orgId, byName);
      }
      const names = staffByOrg.get(orgId)!;

      const opening = comments[0]!;
      let requesterId: number | null = null;
      if (opening.public !== false) {
        const ticket = await helpdesk.getTicket(ticketId);
        requesterId = ticket?.requester_id ?? null;
      }

      const plans: Array<{ commentId: number; staffId: number; reason: string }> = [];

      if (opening.author_id !== requesterId) {
        plans.push({
          commentId: opening.id,
          staffId,
          reason: 'opening←created_by',
        });
      }

      const apiAuthorId = opening.author_id;
      for (const c of comments.slice(1)) {
        if (requesterId != null && c.author_id === requesterId) continue;
        if (c.author_id !== apiAuthorId) continue;
        const signed = staffNameFromNoteSignature(c.body ?? '');
        if (!signed) continue;
        const mapped = names.get(signed.toLowerCase());
        if (!mapped) continue;
        plans.push({ commentId: c.id, staffId: mapped, reason: `sign-off←${signed}` });
      }

      if (!plans.length) {
        skipped += 1;
        process.stdout.write(' skip (customer opener)\n');
        continue;
      }

      process.stdout.write(` ${plans.length} stamp(s)\n`);
      for (const p of plans) {
        console.log(`    comment ${p.commentId} → staff ${p.staffId} (${p.reason})`);
        if (APPLY) {
          await recordHelpdeskCommentStaff({
            orgId,
            ticketId,
            commentId: p.commentId,
            staffId: p.staffId,
          });
        }
        stamped += 1;
      }
    } catch (err) {
      errors += 1;
      process.stdout.write(' ERROR\n');
      console.warn(
        `    ${err instanceof Error ? err.message : err}`,
      );
      await sleep(400);
    }
  }

  console.log(`done — stamped ${stamped}, skipped ${skipped}, errors ${errors}`);
  if (!APPLY && stamped > 0) {
    console.log('Re-run with --apply to write helpdesk_comment_staff.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
