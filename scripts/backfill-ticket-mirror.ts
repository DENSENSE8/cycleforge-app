/**
 * Mirror every helpdesk ticket the app references (support_tickets zendesk rows
 * + ticket_links.zendesk_ticket_id) into the local ticket mirror, for every org
 * with a connected helpdesk — the same refreshTicketMirror the read path uses.
 *
 * Idempotent: tickets already mirrored are skipped (pass --force to re-mirror
 * them). Paced under Zendesk's ~400 req/min account limit: every provider call
 * waits for a slot (default 240/min, leaving headroom for the live app).
 *
 * Dry-run by default (counts only, no provider calls):
 *   set -a; . ./.env; set +a
 *   tsx --conditions=react-server scripts/backfill-ticket-mirror.ts
 *   tsx --conditions=react-server scripts/backfill-ticket-mirror.ts --apply [--force] [--org=<uuid>] [--per-minute=240] [--concurrency=4]
 */
import { setTimeout as sleep } from 'node:timers/promises';
import pool from '@/lib/db';
import { getHelpdeskProvider, type HelpdeskProvider } from '@/lib/integrations/helpdesk';
import { refreshTicketMirror } from '@/lib/support/ticket-mirror';
import type { OrgId } from '@/lib/tenancy/constants';

/** Provider reads the mirror refresh makes, each waiting for a paced slot. */
function pacedReads(helpdesk: HelpdeskProvider, perMinute: number): HelpdeskProvider {
  const intervalMs = Math.ceil(60_000 / perMinute);
  let next = 0;
  const slot = async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + intervalMs;
    if (at > now) await sleep(at - now);
  };
  return {
    ...helpdesk,
    getTicket: async (id) => (await slot(), helpdesk.getTicket(id)),
    listComments: async (id, params) => (await slot(), helpdesk.listComments(id, params)),
    listAgents: async (force) => (await slot(), helpdesk.listAgents(force)),
    getUsers: async (ids) => (await slot(), helpdesk.getUsers(ids)),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const flag = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const onlyOrg = flag('org');
  const perMinute = Math.max(1, Number(flag('per-minute') ?? 240));
  const force = process.argv.includes('--force');
  const concurrency = Math.max(1, Number(flag('concurrency') ?? 4));

  // Cross-tenant discovery (owner pool): which org references which ticket.
  const { rows } = await pool.query<{ organization_id: OrgId; ticket_id: string; mirrored: boolean }>(
    `WITH refs AS (
       SELECT organization_id, external_ticket_id::bigint AS ticket_id
         FROM support_tickets
        WHERE provider = 'zendesk' AND external_ticket_id ~ '^[0-9]{1,15}$'
       UNION
       SELECT organization_id, zendesk_ticket_id
         FROM ticket_links
        WHERE zendesk_ticket_id IS NOT NULL
     )
     SELECT r.organization_id, r.ticket_id::text AS ticket_id,
            EXISTS (SELECT 1 FROM support_tickets st
                     WHERE st.organization_id = r.organization_id
                       AND st.provider = 'zendesk'
                       AND st.external_ticket_id = r.ticket_id::text
                       AND st.mirrored_at IS NOT NULL) AS mirrored
       FROM refs r
      WHERE ($1::uuid IS NULL OR r.organization_id = $1::uuid)
      ORDER BY r.organization_id, r.ticket_id DESC`,
    [onlyOrg ?? null],
  );

  const byOrg = new Map<OrgId, Array<{ id: number; mirrored: boolean }>>();
  for (const r of rows) {
    const list = byOrg.get(r.organization_id) ?? [];
    list.push({ id: Number(r.ticket_id), mirrored: r.mirrored });
    byOrg.set(r.organization_id, list);
  }

  const totals = { orgs: 0, tickets: 0, alreadyMirrored: 0, mirrored: 0, notFound: 0, failed: 0 };
  for (const [orgId, tickets] of byOrg) {
    const helpdesk = await getHelpdeskProvider(orgId);
    const configured = helpdesk ? await helpdesk.isConfigured() : false;
    const todo = tickets.filter((t) => force || !t.mirrored);
    console.log(
      `[org ${orgId}] ${tickets.length} referenced, ${tickets.length - todo.length} already mirrored, ` +
        `${todo.length} to mirror${configured ? '' : ' — helpdesk NOT connected, skipped'}`,
    );
    totals.orgs += 1;
    totals.tickets += tickets.length;
    totals.alreadyMirrored += tickets.length - todo.length;
    if (!apply || !helpdesk || !configured) continue;

    // A few tickets in flight at once; the paced slot still caps provider calls/min.
    const paced = pacedReads(helpdesk, perMinute);
    const queue = [...todo];
    let done = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          try {
            if (await refreshTicketMirror(orgId, paced, t.id)) totals.mirrored += 1;
            else totals.notFound += 1;
          } catch (err) {
            totals.failed += 1;
            console.warn(`  #${t.id} failed:`, err instanceof Error ? err.message : err);
          }
          done += 1;
          if (done % 25 === 0) console.log(`  ${done}/${todo.length}`);
        }
      }),
    );
  }

  const comments = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM support_ticket_comments`,
  );
  console.log(apply ? 'APPLIED' : 'DRY RUN (pass --apply to mirror)', {
    ...totals,
    commentRowsTotal: comments.rows[0]?.n ?? 0,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
