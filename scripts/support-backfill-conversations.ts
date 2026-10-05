/**
 * Import mirrored Zendesk threads into the local Support loop: every
 * Zendesk-bound Support item that has mirrored comments but no thread
 * messages yet runs `syncSupportThreadFromMirror(…, { mode: 'backfill' })` —
 * history is stored (inbound / outbound / internal, answered where a later
 * agent reply exists) without alerts, drafts, task creation or reopen.
 * Local DB only: zero provider calls (the mirror is already local; run
 * scripts/backfill-ticket-mirror.ts first for tickets never mirrored).
 *
 * Idempotent (external_message_id `zendesk:comment:<id>`); dry-run by default:
 *   set -a; . ./.env; set +a
 *   tsx --conditions=react-server scripts/support-backfill-conversations.ts
 *   tsx --conditions=react-server scripts/support-backfill-conversations.ts --apply [--org=<uuid>] [--limit=500]
 */
import pool from '@/lib/db';
import { syncSupportThreadFromMirror } from '@/lib/support/conversation/mirror-bridge';
import type { OrgId } from '@/lib/tenancy/constants';

async function main() {
  const apply = process.argv.includes('--apply');
  const flag = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const onlyOrg = flag('org') ?? null;
  const limit = Math.max(1, Number(flag('limit') ?? 100_000));

  // Cross-tenant discovery (owner pool): items with mirrored comments and an empty Support thread.
  const { rows } = await pool.query<{ organization_id: OrgId; id: string; comments: number }>(
    `SELECT st.organization_id, st.id,
            (SELECT count(*)::int FROM support_ticket_comments c
              WHERE c.organization_id = st.organization_id
                AND c.support_ticket_id = st.id) AS comments
       FROM support_tickets st
      WHERE st.provider = 'zendesk'
        AND st.mirrored_at IS NOT NULL
        AND ($1::uuid IS NULL OR st.organization_id = $1::uuid)
        AND EXISTS (SELECT 1 FROM support_ticket_comments c
                     WHERE c.organization_id = st.organization_id
                       AND c.support_ticket_id = st.id)
        AND NOT EXISTS (SELECT 1
                          FROM entity_threads et
                          JOIN thread_messages tm
                            ON tm.thread_id = et.id
                           AND tm.organization_id = et.organization_id
                           AND tm.deleted_at IS NULL
                         WHERE et.organization_id = st.organization_id
                           AND et.entity_type = 'SUPPORT_TICKET'
                           AND et.entity_id = st.id)
      ORDER BY st.organization_id, st.id
      LIMIT $2`,
    [onlyOrg, limit],
  );

  const perOrg = new Map<OrgId, { items: number; comments: number }>();
  for (const r of rows) {
    const t = perOrg.get(r.organization_id) ?? { items: 0, comments: 0 };
    t.items += 1;
    t.comments += Number(r.comments);
    perOrg.set(r.organization_id, t);
  }
  for (const [orgId, t] of perOrg) {
    console.log(`[org ${orgId}] ${t.items} item(s) to import, ${t.comments} mirrored comment(s)`);
  }

  const totals = { items: rows.length, ingested: 0, skipped: 0, failed: 0 };
  if (apply) {
    let done = 0;
    for (const r of rows) {
      try {
        const res = await syncSupportThreadFromMirror(r.organization_id, Number(r.id), { mode: 'backfill' });
        totals.ingested += res.ingested;
        totals.skipped += res.skipped;
      } catch (err) {
        totals.failed += 1;
        console.warn(`  item ${r.id} failed:`, err instanceof Error ? err.message : err);
      }
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${rows.length}`);
    }
  }

  console.log(apply ? 'APPLIED' : 'DRY RUN (pass --apply to import)', totals);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
