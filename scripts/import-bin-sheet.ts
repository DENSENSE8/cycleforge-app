#!/usr/bin/env tsx
/**
 * import-bin-sheet.ts
 * ───────────────────────────────────────────────────────────────────
 * Bring a paper bin sheet into the system: every non-empty cell becomes a real
 * (bin, SKU, qty) — a catalog SKU, or a temp SKU (`TMP-XXXXX-XXXXX`, on-hold
 * placeholder, photos added later) minted from the ITEM text.
 *
 * Input: the parsed sheet JSON + the owner's decisions in `<sheet>.overrides.json`
 * (see `src/lib/inventory/bin-sheet-import.ts` for the rules).
 *
 * Run:
 *   pnpm import:bin-sheet -- --org <uuid>                       (dry run: prints the plan, writes nothing)
 *   pnpm import:bin-sheet -- --org <uuid> --apply [--staff <id>]
 *   … --location-prefix QA-   resolve bin `QA-C-04-15-1` for sheet cell `C-04-15-1`
 *                              (locations.name is globally unique; QA rehearsal bins)
 *   … --sheet <path> --overrides <path>   (default: the C-04 2026-09-24 sheet)
 *
 * Writes only through domain functions — `createProvisionalSku` for temps,
 * `adjustBinQty` (reason CYCLE_COUNT, delta = sheet − current) for counts — each
 * audited (source `bin-sheet-import`) and published on realtime. Idempotent:
 * temp SKUs derive from `<importKey>:<product key>`, and a count already equal
 * to the sheet writes nothing, so a second `--apply` is a no-op.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { adjustBinQty } from '@/lib/neon/location-queries';
import {
  createProvisionalSku,
  findProvisionalMergeTarget,
  getProvisionalSkuDetail,
} from '@/lib/neon/provisional-sku-queries';
import { provisionalSkuForSourceRef } from '@/lib/inventory/provisional-sku';
import {
  planBinSheet,
  type BinSheetOverrides,
  type BinSheetPlan,
  type BinSheetRow,
} from '@/lib/inventory/bin-sheet-import';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { publishSkuExceptionChanged } from '@/lib/realtime/publish';

const AUDIT_SOURCE = 'bin-sheet-import';
const DEFAULT_SHEET = 'docs/handoff/data/c04-bin-sheet-2026-09-24.json';

interface Args {
  org: string;
  apply: boolean;
  staffId: number | null;
  locationPrefix: string;
  sheet: string;
  overrides: string;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const org = value('--org');
  if (!org || !/^[0-9a-f-]{36}$/i.test(org)) throw new Error('--org <uuid> is required');
  const staff = value('--staff');
  const sheet = value('--sheet') ?? DEFAULT_SHEET;
  return {
    org,
    apply: argv.includes('--apply'),
    staffId: staff ? Number(staff) : null,
    locationPrefix: value('--location-prefix') ?? '',
    sheet,
    overrides: value('--overrides') ?? sheet.replace(/\.json$/, '.overrides.json'),
  };
}

interface ResolvedBin {
  id: number;
  barcode: string;
}

interface ResolvedProduct {
  key: string;
  sku: string;
  title: string;
  description: string;
  state: 'new' | 'existing' | 'merged';
  mergedInto: string | null;
  countNeeded: boolean;
}

interface ResolvedLine {
  location: string;
  bin: ResolvedBin | null;
  sku: string | null;
  label: string;
  what: string;
  current: number;
  target: number | null;
  flags: string[];
}

interface Resolution {
  products: ResolvedProduct[];
  lines: ResolvedLine[];
  untouched: Array<{ location: string; sku: string; qty: number }>;
}

async function resolvePlan(plan: BinSheetPlan, args: Args): Promise<Resolution> {
  const org = args.org;

  const products: ResolvedProduct[] = [];
  for (const p of plan.products) {
    const sku = provisionalSkuForSourceRef(org, p.sourceRef);
    if (!sku) throw new Error(`temp ${p.key}: could not derive a SKU`);
    const existing = await getProvisionalSkuDetail(sku, org);
    const mergedInto = existing ? null : await findProvisionalMergeTarget(sku, org);
    products.push({
      key: p.key,
      sku,
      title: p.title,
      description: p.description,
      state: existing ? 'existing' : mergedInto ? 'merged' : 'new',
      mergedInto,
      countNeeded: p.countNeeded,
    });
  }
  const productByKey = new Map(products.map((p) => [p.key, p]));

  const locationNames = [...new Set(plan.lines.map((l) => `${args.locationPrefix}${l.location}`))];
  const normalizedLocationPrefixes = locationNames.map((name) => name.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  const bins = await tenantQuery<{ id: number; name: string; barcode: string }>(
    org,
    `SELECT id, name, barcode FROM locations
      WHERE organization_id = $1
        AND is_active = true
        AND (
          name = ANY($2::text[])
          OR name LIKE ANY($3::text[])
          OR UPPER(regexp_replace(barcode, '[^A-Za-z0-9]', '', 'g')) LIKE ANY($4::text[])
        )`,
    [org, locationNames, locationNames.map((name) => `${name}-%`), normalizedLocationPrefixes.map((prefix) => `${prefix}%`)],
  );
  const binByName = new Map<string, ResolvedBin>();
  for (const name of locationNames) {
    const normalized = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const matches = bins.rows.filter(
      (bin) =>
        bin.name === name ||
        bin.name.startsWith(`${name}-`) ||
        bin.barcode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().startsWith(normalized),
    );
    // Never make a stock write against a guess: a printed face must resolve to
    // exactly one stored location record.
    if (matches.length === 1) binByName.set(name, { id: matches[0].id, barcode: matches[0].barcode });
  }

  const realSkus = [...new Set(plan.lines.flatMap((l) => (l.target.kind === 'real' ? [l.target.sku] : [])))];
  const catalog = await tenantQuery<{ sku: string; zoho_name: string | null; zoho_status: string | null; stock: number | null; binned: number | null }>(
    org,
    `SELECT sc.sku,
            i.name AS zoho_name, i.status AS zoho_status,
            ss.stock,
            (SELECT COALESCE(SUM(bc.qty), 0)::int FROM bin_contents bc
              WHERE bc.organization_id = sc.organization_id AND bc.sku = sc.sku) AS binned
       FROM sku_catalog sc
       LEFT JOIN items i
         ON i.organization_id = sc.organization_id
        AND (i.zoho_item_id = sc.provider_item_id OR (sc.provider_item_id IS NULL AND BTRIM(i.sku) = sc.sku))
       LEFT JOIN sku_stock ss ON ss.organization_id = sc.organization_id AND ss.sku = sc.sku
      WHERE sc.organization_id = $1 AND sc.sku = ANY($2::text[]) AND sc.is_provisional = false`,
    [org, realSkus],
  );
  const catalogBySku = new Map(catalog.rows.map((r) => [r.sku, r]));

  const binIds = [...binByName.values()].map((b) => b.id);
  const contents = await tenantQuery<{ location_id: number; sku: string; qty: number }>(
    org,
    `SELECT location_id, sku, qty FROM bin_contents WHERE organization_id = $1 AND location_id = ANY($2::int[])`,
    [org, binIds],
  );
  const qtyAt = (locationId: number, sku: string) =>
    Number(contents.rows.find((r) => r.location_id === locationId && r.sku === sku)?.qty ?? 0);

  const lines: ResolvedLine[] = plan.lines.map((l) => {
    const bin = binByName.get(`${args.locationPrefix}${l.location}`) ?? null;
    const flags: string[] = [];
    if (!bin) flags.push(`NO BIN ${args.locationPrefix}${l.location}`);
    let sku: string | null = null;
    let label: string;
    if (l.target.kind === 'real') {
      const row = catalogBySku.get(l.target.sku);
      if (!row) flags.push(`NOT IN CATALOG ${l.target.sku}`);
      else if (row.zoho_status !== 'active') flags.push(`NOT AN ACTIVE ZOHO ITEM ${l.target.sku}`);
      else {
        sku = l.target.sku;
        const unbinned = Number(row.stock ?? 0) - Number(row.binned ?? 0);
        if (unbinned !== 0) flags.push(`SKU total ${row.stock ?? 0}, binned ${row.binned ?? 0} (unlocated ${unbinned})`);
      }
      label = `${l.target.sku}${row?.zoho_name ? ` · ${row.zoho_name}` : ''}`;
    } else {
      const p = productByKey.get(l.target.key);
      if (!p) throw new Error(`temp ${l.target.key}: missing from plan`);
      if (p.state === 'merged') flags.push(`TEMP ${p.sku} WAS PAIRED INTO ${p.mergedInto} — not re-counted`);
      else sku = p.sku;
      label = `TMP (${p.state === 'new' ? 'new' : `existing`} ${p.sku}) · ${p.title}`;
    }
    if (l.qty == null) flags.push('COUNT NEEDED');
    return {
      location: l.location,
      bin,
      sku,
      label,
      what: l.what,
      current: bin && sku ? qtyAt(bin.id, sku) : 0,
      target: l.qty,
      flags,
    };
  });

  const planned = new Set(lines.flatMap((l) => (l.bin && l.sku ? [`${l.bin.id}|${l.sku}`] : [])));
  const nameById = new Map([...binByName.entries()].map(([name, b]) => [b.id, name]));
  const untouched = contents.rows
    .filter((r) => !planned.has(`${r.location_id}|${r.sku}`))
    .map((r) => ({ location: nameById.get(r.location_id) ?? String(r.location_id), sku: r.sku, qty: Number(r.qty) }));

  return { products, lines, untouched };
}

function printResolution(title: string, r: Resolution, plan: BinSheetPlan): void {
  console.log(`\n=== ${title} ===`);
  console.log('location     bin        qty now → sheet  delta  SKU / what');
  for (const l of r.lines) {
    const delta = l.target == null || !l.sku ? '—' : String(l.target - l.current);
    const signed = delta !== '—' && Number(delta) > 0 ? `+${delta}` : delta;
    console.log(
      `${l.location.padEnd(12)} ${(l.bin?.barcode ?? '—').padEnd(10)} ${String(l.current).padStart(7)} → ${String(l.target ?? '—').padEnd(5)} ${signed.padStart(5)}  ${l.label} [${l.what}]${l.flags.length ? `  ⚑ ${l.flags.join('; ')}` : ''}`,
    );
  }
  for (const location of plan.empty) console.log(`${location.padEnd(12)} empty on the sheet — no write`);
  if (r.untouched.length) {
    console.log('\nIn these bins but not on the sheet (left as is):');
    for (const u of r.untouched) console.log(`  ${u.location}  ${u.sku}  qty ${u.qty}`);
  }
  const counts = { new: 0, existing: 0, merged: 0 };
  for (const p of r.products) counts[p.state] += 1;
  console.log(
    `\nTemp SKUs: ${r.products.length} (${counts.new} new, ${counts.existing} existing, ${counts.merged} already paired). ` +
      `Count writes pending: ${r.lines.filter((l) => l.sku && l.bin && l.target != null && l.target !== l.current).length}.`,
  );
  const needed = r.products.filter((p) => p.countNeeded);
  if (needed.length) console.log(`Count needed: ${needed.map((p) => `${p.sku} ${p.title}`).join(' · ')}`);
}

async function apply(r: Resolution, overrides: BinSheetOverrides, args: Args): Promise<void> {
  const org = args.org;
  let created = 0;
  for (const p of r.products) {
    if (p.state !== 'new') continue;
    const item = await createProvisionalSku(
      {
        sourceRef: `${overrides.importKey}:${p.key}`,
        productTitle: p.title,
        description: p.description,
        staffId: args.staffId,
      },
      org,
    );
    if (item.sku !== p.sku) throw new Error(`temp ${p.key}: minted ${item.sku}, planned ${p.sku}`);
    await recordAudit(pool, null, null, {
      source: AUDIT_SOURCE,
      action: AUDIT_ACTION.SKU_STOCK_ADJUST,
      entityType: AUDIT_ENTITY.SKU_STOCK,
      entityId: item.sku,
      after: { sku: item.sku, product_title: item.productTitle, description: item.description },
      method: 'system',
      reasonCode: 'PROVISIONAL_CREATE',
      actorStaffIdOverride: args.staffId,
      organizationIdOverride: org,
      extra: { import_key: overrides.importKey, product_key: p.key },
    });
    await publishSkuExceptionChanged({ organizationId: org, sku: item.sku, action: 'created', source: AUDIT_SOURCE });
    created += 1;
  }
  if (created) await invalidateCacheTags(org, [CACHE_TAGS.skuCatalog]);

  let written = 0;
  for (const l of r.lines) {
    if (!l.bin || !l.sku || l.target == null) continue;
    const delta = l.target - l.current;
    if (delta === 0) continue;
    await adjustBinQty(
      {
        locationId: l.bin.id,
        sku: l.sku,
        delta,
        staffId: args.staffId,
        reason: 'CYCLE_COUNT',
        notes: overrides.ledgerNote,
        source: AUDIT_SOURCE,
      },
      org,
    );
    await recordAudit(pool, null, null, {
      source: AUDIT_SOURCE,
      action: AUDIT_ACTION.SKU_STOCK_ADJUST,
      entityType: AUDIT_ENTITY.BIN,
      entityId: l.bin.id,
      before: { qty: l.current },
      after: { qty: l.target },
      binCode: l.bin.barcode,
      locationCode: `${args.locationPrefix}${l.location}`,
      method: 'system',
      reasonCode: 'CYCLE_COUNT',
      note: overrides.ledgerNote,
      actorStaffIdOverride: args.staffId,
      organizationIdOverride: org,
      extra: { sku: l.sku, delta, what: l.what, import_key: overrides.importKey },
    });
    written += 1;
  }
  console.log(`\nApplied: ${created} temp SKU(s) created, ${written} count write(s).`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const sheet = JSON.parse(readFileSync(path.resolve(root, args.sheet), 'utf8')) as { rows: BinSheetRow[] };
  const overrides = JSON.parse(readFileSync(path.resolve(root, args.overrides), 'utf8')) as BinSheetOverrides;
  const plan = planBinSheet(sheet.rows, overrides);

  const before = await resolvePlan(plan, args);
  printResolution(`${args.apply ? 'PLAN' : 'DRY RUN'} · org ${args.org}${args.locationPrefix ? ` · bins ${args.locationPrefix}*` : ''}`, before, plan);
  if (!args.apply) {
    console.log('\nDry run — nothing written. Re-run with --apply to write.');
    return;
  }

  await apply(before, overrides, args);
  const after = await resolvePlan(plan, args);
  printResolution('POST-WRITE', after, plan);
  const mismatched = after.lines.filter((l) => l.sku && l.bin && l.target != null && l.current !== l.target);
  if (mismatched.length) {
    console.error(`\n✗ ${mismatched.length} line(s) do not match the sheet after writing.`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Every writable line matches the sheet.');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
