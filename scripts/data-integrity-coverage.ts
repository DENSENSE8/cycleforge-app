#!/usr/bin/env tsx
/**
 * data-integrity-coverage.ts — the Phase 1 pass/fail check
 * (docs/refactors/records/PROMPT-records-sheet.md). Read-only. Prints, per org
 * and per platform (the catalog platform an `account_source` belongs to; the
 * account itself in the second column), how many orders carry a buyer, a
 * Placed date, how many gaps ShipStation refs could still fill, the
 * case-variant spellings left, why blank-platform rows are blank, and how many
 * staff each station event names.
 *
 * Usage:
 *   tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/data-integrity-coverage.ts [--orgId=<uuid>] [--months=6]
 */

import { adminPool } from '../src/lib/db';

interface PlatformRow {
  platform: string;
  account: string;
  orders: number;
  buyer: number;
  placed: number;
  ss_linked: number;
  buyer_fillable_ss: number;
  placed_fillable_ss: number;
  win_orders: number;
  win_buyer: number;
  win_placed: number;
}

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`);
const frac = (n: number, d: number): string => `${n} (${pct(n, d)})`;

function table(headers: string[], rows: (string | number)[][]): string {
  const lines = [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`];
  for (const r of rows) lines.push(`| ${r.join(' | ')} |`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const orgArg = args.find((a) => a.startsWith('--orgId='))?.slice('--orgId='.length) ?? null;
  const months = Number(args.find((a) => a.startsWith('--months='))?.slice('--months='.length) ?? 6);

  const orgs = (
    await adminPool.query<{ organization_id: string; n: number }>(
      `SELECT organization_id, COUNT(*)::int AS n FROM orders
        WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)
        GROUP BY 1 ORDER BY 2 DESC`,
      [orgArg],
    )
  ).rows;

  for (const org of orgs) {
    const orgId = org.organization_id;
    console.log(`\n## Org ${orgId} — ${org.n} orders (window: last ${months} months by Imported)\n`);

    const rows = (
      await adminPool.query<PlatformRow>(
        `WITH ss AS (
           SELECT DISTINCT ON (r.order_row_id) r.order_row_id, r.order_date, r.customer_username, r.customer_email,
                  r.ship_to->>'name' AS ship_name
             FROM shipstation_order_refs r
            WHERE r.organization_id = $1
            ORDER BY r.order_row_id, r.last_seen_at DESC
         ),
         o AS (
           SELECT o.*,
                  COALESCE(
                    (SELECT lower(p.slug) FROM platform_accounts pa JOIN platforms p ON p.id = pa.platform_id
                      WHERE pa.organization_id = o.organization_id AND lower(btrim(pa.slug)) = lower(btrim(o.account_source))
                      ORDER BY pa.is_active DESC, pa.id LIMIT 1),
                    NULLIF(lower(btrim(o.account_source)), ''), '(blank)') AS platform_key
             FROM orders o WHERE o.organization_id = $1
         )
         SELECT o.platform_key AS platform,
                COALESCE(NULLIF(o.account_source, ''), '(blank)') AS account,
                COUNT(*)::int AS orders,
                COUNT(o.customer_id)::int AS buyer,
                COUNT(o.order_date)::int AS placed,
                COUNT(ss.order_row_id)::int AS ss_linked,
                COUNT(*) FILTER (WHERE o.customer_id IS NULL AND (ss.customer_username IS NOT NULL OR ss.customer_email IS NOT NULL OR ss.ship_name IS NOT NULL))::int AS buyer_fillable_ss,
                COUNT(*) FILTER (WHERE o.order_date IS NULL AND NULLIF(ss.order_date, '') IS NOT NULL)::int AS placed_fillable_ss,
                COUNT(*) FILTER (WHERE o.created_at >= now() - make_interval(months => $2))::int AS win_orders,
                COUNT(o.customer_id) FILTER (WHERE o.created_at >= now() - make_interval(months => $2))::int AS win_buyer,
                COUNT(o.order_date) FILTER (WHERE o.created_at >= now() - make_interval(months => $2))::int AS win_placed
           FROM o LEFT JOIN ss ON ss.order_row_id = o.id
          GROUP BY 1, 2
          ORDER BY 1, 3 DESC`,
        [orgId, months],
      )
    ).rows;

    const sum = (pick: (r: PlatformRow) => number, of: readonly PlatformRow[] = rows) => of.reduce((a, r) => a + pick(r), 0);
    const line = (label: string, account: string, of: readonly PlatformRow[]): (string | number)[] => {
      const o = sum((r) => r.orders, of);
      const wo = sum((r) => r.win_orders, of);
      return [
        label,
        account,
        o,
        frac(sum((r) => r.buyer, of), o),
        frac(sum((r) => r.placed, of), o),
        sum((r) => r.ss_linked, of),
        sum((r) => r.buyer_fillable_ss, of),
        sum((r) => r.placed_fillable_ss, of),
        wo,
        frac(sum((r) => r.win_buyer, of), wo),
        frac(sum((r) => r.win_placed, of), wo),
      ];
    };

    const platforms = [...new Set(rows.map((r) => r.platform))];
    const body: (string | number)[][] = [];
    for (const p of platforms) {
      const group = rows.filter((r) => r.platform === p);
      if (group.length > 1) body.push(line(`**${p}**`, '(all)', group));
      for (const r of group) body.push(line(group.length > 1 ? '' : p, r.account, [r]));
    }
    body.push(line('**Total**', '', rows));
    console.log(
      table(
        ['Platform', 'Account', 'Orders', 'Buyer', 'Placed', 'SS-linked', 'Buyer fillable (SS)', 'Placed fillable (SS)', `${months}mo orders`, `${months}mo buyer`, `${months}mo placed`],
        body,
      ),
    );

    const variants = (
      await adminPool.query<{ spellings: string }>(
        `SELECT STRING_AGG(DISTINCT account_source, ', ') AS spellings
           FROM orders WHERE organization_id = $1 AND NULLIF(BTRIM(account_source), '') IS NOT NULL
          GROUP BY LOWER(BTRIM(account_source)) HAVING COUNT(DISTINCT account_source) > 1`,
        [orgId],
      )
    ).rows;
    console.log(`\nCase-variant platform spellings: ${variants.length === 0 ? 'none' : variants.map((v) => `[${v.spellings}]`).join(' ')}`);

    // Why a row is blank: a twin row of the same order line already holds the
    // platform key (legacy multi-package rows), or the order number names no channel.
    const blanks = (
      await adminPool.query<{ reason: string; n: number; sample: string }>(
        `SELECT CASE
                  WHEN EXISTS (SELECT 1 FROM orders t
                                WHERE t.organization_id = o.organization_id AND t.order_id = o.order_id
                                  AND t.external_line_id IS NOT DISTINCT FROM o.external_line_id
                                  AND t.id <> o.id AND NULLIF(t.account_source, '') IS NOT NULL)
                    THEN 'second package row of an order line whose first row holds the platform'
                  ELSE 'order number names no channel and the writer had none'
                END AS reason,
                COUNT(*)::int AS n,
                STRING_AGG(o.order_id, ', ' ORDER BY o.id) FILTER (WHERE o.order_id IS NOT NULL) AS sample
           FROM orders o
          WHERE o.organization_id = $1 AND NULLIF(BTRIM(o.account_source), '') IS NULL
          GROUP BY 1`,
        [orgId],
      )
    ).rows;
    for (const b of blanks) console.log(`Blank platform — ${b.reason}: ${b.n} (${(b.sample ?? '').split(', ').slice(0, 8).join(', ')}${b.n > 8 ? ', …' : ''})`);

    const refs = (
      await adminPool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM shipstation_order_refs WHERE organization_id = $1`, [orgId])
    ).rows[0];
    console.log(`ShipStation order refs: ${refs?.n ?? 0}`);

    const events = (
      await adminPool.query<{ activity_type: string; rows: number; staff: number }>(
        `SELECT activity_type, COUNT(*)::int AS rows, COUNT(DISTINCT staff_id)::int AS staff
           FROM station_activity_logs
          WHERE organization_id = $1 AND activity_type IN ('PICK_SCANNED', 'PACK_COMPLETED', 'SHIP_CONFIRM')
          GROUP BY 1 ORDER BY 1`,
        [orgId],
      )
    ).rows;
    console.log(`\n${table(['Station event', 'Rows', 'Staff'], events.map((e) => [e.activity_type, e.rows, e.staff]))}`);
  }

  await adminPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
