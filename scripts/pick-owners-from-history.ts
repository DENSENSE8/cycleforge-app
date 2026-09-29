#!/usr/bin/env tsx
/**
 * pick-owners-from-history.ts — derive item-number → picker owners from pick
 * history (`sku_staff_pairings`) and put each owner on the open, never-assigned
 * orders of their items. Dry run by default: prints the per-item plan and the
 * per-picker order counts as markdown; `--apply` writes both.
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/pick-owners-from-history.ts \
 *     --orgId=<uuid> [--override=SKU=STAFF_ID ...] [--apply]
 */

// First: the db pool reads DATABASE_URL when its module evaluates.
import 'dotenv/config';
import type { OrgId } from '../src/lib/tenancy/constants';
import { withTenantTransaction } from '../src/lib/tenancy/db';
import { getStaffNameMap } from '../src/lib/work-assignments/order-assignment-snapshot';
import { backfillOpenOrderPickers, deriveSkuPickOwners, loadPickHistory } from '../src/lib/picking/sku-pick-owners';
import { isOwnableSku, OWNER_MIN_PICKS, OWNER_MIN_SHARE, RECENT_PICK_DAYS, rankPickWindow } from '../src/lib/picking/pick-history-owners';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const orgId = args.find((a) => a.startsWith('--orgId='))?.slice('--orgId='.length);
  if (!orgId) throw new Error('--orgId=<uuid> is required');
  const apply = args.includes('--apply');
  const overrides = new Map<string, number>();
  for (const arg of args.filter((a) => a.startsWith('--override='))) {
    const [sku, staff] = arg.slice('--override='.length).split('=');
    const staffId = Number(staff);
    if (!sku?.trim() || !Number.isInteger(staffId) || staffId <= 0) throw new Error(`bad ${arg}: want --override=SKU=STAFF_ID`);
    overrides.set(sku.trim(), staffId);
  }

  const org = orgId as OrgId;

  const derived = await deriveSkuPickOwners(org, { dryRun: !apply, overrides });
  // A dry run's backfill reads the plan as if it were written; existing owners win, as the insert does.
  const owners = apply
    ? undefined
    : new Map([
        ...derived.toInsert.map((o) => [o.sku, o.staffId] as const),
        ...derived.alreadyOwned.map((o) => [o.sku, o.currentStaffId] as const),
      ]);
  const backfill = await backfillOpenOrderPickers(org, { dryRun: !apply, owners });

  const { history, titles } = await withTenantTransaction(org, async (client) => {
    const rows = await loadPickHistory(client, org, null);
    const skus = [...new Set(rows.map((r) => r.sku)), ...overrides.keys()];
    const t = await client.query<{ sku: string; title: string | null }>(
      `SELECT k.sku,
              COALESCE(
                (SELECT sc.product_title FROM sku_catalog sc WHERE sc.organization_id = $1 AND sc.sku = k.sku LIMIT 1),
                (SELECT o.product_title FROM orders o WHERE o.organization_id = $1 AND BTRIM(o.sku) = k.sku ORDER BY o.id DESC LIMIT 1)
              ) AS title
         FROM unnest($2::text[]) AS k(sku)`,
      [org, skus],
    );
    return { history: rows, titles: new Map(t.rows.map((r) => [r.sku, r.title] as const)) };
  });

  const bySku = new Map<string, typeof history>();
  for (const row of history) {
    if (!isOwnableSku(row.sku)) continue;
    bySku.set(row.sku, [...(bySku.get(row.sku) ?? []), row]);
  }
  const plannedSkus = new Set(derived.planned.map((o) => o.sku));
  // Not owned, but someone has enough picks of their own: lost on share or a tie.
  const unowned = [...bySku.entries()].flatMap(([sku, rows]) => {
    if (plannedSkus.has(sku)) return [];
    const w = rankPickWindow(rows, 'all');
    return w.picksOf(w.ranked[0]) >= OWNER_MIN_PICKS ? [{ sku, window: 'all' as const, ...w }] : [];
  });
  const thin = [...bySku.keys()].filter((sku) => !plannedSkus.has(sku)).length - unowned.length;

  const names = await getStaffNameMap([
    ...derived.planned.flatMap((o) => [o.staffId, o.backupStaffId]),
    ...derived.alreadyOwned.map((o) => o.currentStaffId),
    ...backfill.planned.map((p) => p.staffId),
    ...unowned.flatMap((u) => u.ranked.slice(0, 2)),
  ]);
  const who = (id: number | null | undefined) => (id == null ? '—' : `${names.get(id) ?? 'Staff'} (${id})`);
  const cell = (s: string | null | undefined) => (s ?? '').replace(/\|/g, '\\|').slice(0, 70);
  const span = (w: 'recent' | 'all') => (w === 'recent' ? `${RECENT_PICK_DAYS}d` : 'all-time');
  const insertSet = new Set(derived.toInsert.map((o) => o.sku));
  const owned = new Map(derived.alreadyOwned.map((o) => [o.sku, o.currentStaffId] as const));

  const out: string[] = [];
  out.push(`# Pick owners from history — ${apply ? 'APPLIED' : 'DRY RUN'} (${new Date().toISOString()})`, '');
  out.push(
    `Rule: owner = leader of the last ${RECENT_PICK_DAYS} days (by COALESCE(picked_at, order created_at)) with ≥${OWNER_MIN_PICKS} picks of their own and ≥${OWNER_MIN_SHARE * 100}% share;`,
    `if nobody qualifies there, the all-time leader under the same thresholds. Tie → none. Backup = runner-up of the deciding window. Overrides win.`,
    '',
  );
  const perStaff = (ids: number[]) =>
    [...ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1]);
  out.push(`## Summary`, '');
  out.push(`- Items with an owner: ${derived.planned.length} (${derived.planned.filter((o) => o.source === 'override').length} override)`);
  out.push(`- ${apply ? 'Inserted' : 'Would insert'} into sku_staff_pairings: ${apply ? derived.inserted : derived.toInsert.length}`);
  out.push(`- Already owned (kept): ${derived.alreadyOwned.length}`);
  out.push(`- No owner, contested (all-time leader has ≥${OWNER_MIN_PICKS} picks but < ${OWNER_MIN_SHARE * 100}% or tied): ${unowned.length}; too thin (every picker < ${OWNER_MIN_PICKS}): ${thin}`);
  out.push('', '| Picker | Items owned |', '|---|---:|');
  for (const [id, n] of perStaff(derived.toInsert.map((o) => o.staffId))) out.push(`| ${who(id)} | ${n} |`);
  out.push('', `## Open orders (desk pick queue, never had a picker)`, '');
  const orders = apply ? backfill.assigned : backfill.planned;
  out.push(`- Candidates: ${backfill.candidates}; ${apply ? 'assigned' : 'would assign'}: ${orders.length}`);
  out.push('', '| Picker | Orders |', '|---|---:|');
  for (const [id, n] of perStaff(orders.map((p) => p.staffId))) out.push(`| ${who(id)} | ${n} |`);
  const standIns = orders.filter((p) => p.via === 'backup');
  if (standIns.length) out.push('', `${standIns.length} of those go to a backup (owner out today).`);

  out.push('', `## Per item`, '', '| SKU | Title | Window | Owner | n/total | Backup | Override? | Status |', '|---|---|---|---|---:|---|---|---|');
  for (const o of derived.planned) {
    const status = insertSet.has(o.sku) ? (apply ? 'inserted' : 'would insert') : owned.has(o.sku) ? `kept: ${who(owned.get(o.sku))}` : 'skipped: inactive staff';
    out.push(
      `| ${o.sku} | ${cell(titles.get(o.sku))} | ${span(o.window)} | ${who(o.staffId)} | ${o.picks}/${o.total} | ${who(o.backupStaffId)} | ${o.source === 'override' ? 'yes' : ''} | ${status} |`,
    );
  }
  out.push('', `## Contested (no owner)`, '', '| SKU | Title | Window | Leader | n/total | Runner-up |', '|---|---|---|---|---:|---|');
  for (const u of unowned) {
    out.push(`| ${u.sku} | ${cell(titles.get(u.sku))} | ${span(u.window)} | ${who(u.ranked[0])} | ${u.picksOf(u.ranked[0])}/${u.total} | ${who(u.ranked[1])} |`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
