import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  auditSkuIdentitySource,
  resolveSkuIdentityBrand,
  resolveSkuIdentityTitle,
  skuBrandJoinOnSql,
  skuCatalogTitleUnownedPredicateSql,
  SKU_BRAND_JOIN_ON_SQL,
  SKU_CATALOG_JOIN_ON_SQL,
  SKU_IDENTITY_TITLE_ORDER,
  type SkuIdentityViolation,
} from './sku-identity-law';

const REPO = path.resolve(__dirname, '../../..');

/* ── rule 2: the title ladder ──────────────────────────────────────────── */

test('the catalog title governs; an external (Zoho) item name never overrides it', () => {
  // Operator 2026-09-27: CycleForge's own catalog is the source of truth.
  assert.equal(
    resolveSkuIdentityTitle({
      catalog_product_title: 'Bose Solo Soundbar Series II',
      zoho_item_title: 'Bose Solo Soundbar 2 (Zoho name)',
      item_name: 'Bose Solo Soundbar 2 Home Theater, Certified Refurbished',
      sku: '00143',
    }),
    'Bose Solo Soundbar Series II',
  );
});

test('the Zoho item name is the fallback when the catalog has no title', () => {
  assert.equal(
    resolveSkuIdentityTitle({ catalog_product_title: '  ', zoho_item_title: 'Bose Wave Music System', item_name: 'wave' }),
    'Bose Wave Music System',
  );
});

test('the Unfound PO stub never wins ahead of a real later field', () => {
  assert.equal(
    resolveSkuIdentityTitle({ item_name: 'Unfound PO', sku: '00143' }),
    '00143',
  );
  assert.equal(resolveSkuIdentityTitle({ item_name: '   ' }), '');
  assert.equal(resolveSkuIdentityTitle({}), '');
});

test('precedence is exactly the declared order', () => {
  const row = {
    zoho_item_title: 'z',
    catalog_product_title: 'c',
    item_name: 'i',
    sku: 's',
    zoho_item_id: 'id',
  };
  const seen: string[] = [];
  let remaining: Record<string, string | null> = { ...row };
  for (let i = 0; i < SKU_IDENTITY_TITLE_ORDER.length; i++) {
    seen.push(resolveSkuIdentityTitle(remaining));
    remaining = { ...remaining, [SKU_IDENTITY_TITLE_ORDER[i]]: null };
  }
  assert.deepEqual(seen, ['c', 'z', 'i', 's', 'id']);
});

/* ── brand rides the law: the catalog governs, a guess never surfaces ─── */

test('a catalog brand at the fact threshold beats the Zoho brand; Zoho is the fallback', () => {
  assert.equal(
    resolveSkuIdentityBrand({ zoho_item_brand: 'BOSE', catalog_brand: 'Bose', catalog_brand_confidence: 1 }),
    'Bose',
  );
  assert.equal(resolveSkuIdentityBrand({ zoho_item_brand: 'BOSE', catalog_brand: 'Panasonic', catalog_brand_confidence: 0.5 }), 'BOSE');
});

test('a catalog brand below 0.90 (or with no confidence) is a proposal, not a brand', () => {
  assert.equal(resolveSkuIdentityBrand({ catalog_brand: 'Sony', catalog_brand_confidence: 0.6 }), '');
  assert.equal(resolveSkuIdentityBrand({ catalog_brand: 'Sony', catalog_brand_confidence: null }), '');
  assert.equal(resolveSkuIdentityBrand({ catalog_brand: 'Sony', catalog_brand_confidence: 0.9 }), 'Sony');
  assert.equal(resolveSkuIdentityBrand({}), '');
});

test('the brand join constant is org-scoped and carries the fact threshold; the builder matches it', () => {
  assert.equal(skuBrandJoinOnSql(), SKU_BRAND_JOIN_ON_SQL);
  assert.match(SKU_BRAND_JOIN_ON_SQL, /pb\.organization_id = sc\.organization_id/);
  assert.match(SKU_BRAND_JOIN_ON_SQL, /brand_confidence >= 0\.90/);
});

test('a tenant-blind product_brands join is a violation; an org-scoped one is not', () => {
  const blind = auditSkuIdentitySource('x.ts', `  LEFT JOIN product_brands pb ON pb.id = sc.brand_id\n  WHERE sc.id = $1`);
  assert.deepEqual(blind.map((x) => x.kind), ['tenant-blind-brand-join']);
  assert.deepEqual(auditSkuIdentitySource('x.ts', `  JOIN product_brands pb ON \${SKU_BRAND_JOIN_ON_SQL}`), []);
  assert.deepEqual(auditSkuIdentitySource('x.ts', `  JOIN product_brands pb ON \${skuBrandJoinOnSql('s', 'pb')}`), []);
});

/* ── rule 1 + 4: the shapes the scan refuses ───────────────────────────── */

test('a tenant-blind SKU-keyed catalog join is a violation', () => {
  const v = auditSkuIdentitySource(
    'x.ts',
    `    LEFT JOIN sku_catalog sc ON sc.sku = rl.sku\n     WHERE rl.receiving_id = $1`,
  );
  assert.deepEqual(v.map((x) => x.kind), ['tenant-blind-join']);
});

test('an id-keyed catalog join is out of scope', () => {
  assert.deepEqual(
    auditSkuIdentitySource('x.ts', `JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id`),
    [],
  );
});

test('the deleted similarity guard is a violation if reintroduced', () => {
  const v = auditSkuIdentitySource(
    'x.ts',
    [
      `LEFT JOIN sku_catalog sc ON sc.sku = rl.sku AND sc.organization_id = rl.organization_id`,
      `  AND GREATEST(similarity(LOWER(sc.product_title), LOWER(rl.item_name)), 0) >= 0.25`,
    ].join('\n'),
  );
  assert.ok(v.some((x) => x.kind === 'title-similarity-guard'), 'guard must be refused');
});

test('an external-title-first ladder is a violation; catalog-first is not', () => {
  const v = auditSkuIdentitySource(
    'x.ts',
    `  const raw =\n    row.zoho_item_title ||\n    row.catalog_product_title ||\n    row.sku;`,
  );
  assert.deepEqual(v.map((x) => x.kind), ['external-title-first']);
  assert.deepEqual(
    auditSkuIdentitySource('x.ts', `  const raw = row.catalog_product_title || row.zoho_item_title || row.sku;`),
    [],
  );
});

test('an unguarded catalog title write is a violation, a guarded one is not', () => {
  const unguarded = `await q(\`UPDATE sku_catalog\n   SET product_title = $1\n WHERE sku = $2\`)`;
  assert.deepEqual(
    auditSkuIdentitySource('x.ts', unguarded).map((x) => x.kind),
    ['platform-title-write'],
  );

  const guarded = `await q(\`UPDATE sku_catalog
   SET product_title = $1
 WHERE sku = $2
   AND ${skuCatalogTitleUnownedPredicateSql()}\`)`;
  assert.deepEqual(auditSkuIdentitySource('x.ts', guarded), []);
});

/* ── the hard gate: the real tree obeys its own law ────────────────────── */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test('src/ contains no SKU identity violations', () => {
  const violations: SkuIdentityViolation[] = [];
  for (const full of walk(path.join(REPO, 'src'))) {
    const text = readFileSync(full, 'utf8');
    if (!/sku_catalog|catalog_product_title|product_brands/.test(text)) continue;
    violations.push(...auditSkuIdentitySource(path.relative(REPO, full), text));
  }
  assert.deepEqual(
    violations.map((v) => `${v.kind} ${v.file}:${v.line}`),
    [],
  );
});

test('every receiving-line catalog join uses the one ON constant', () => {
  const files = [
    'src/lib/receiving/lines/build-sql.ts',
    'src/lib/receiving/lines/legacy-route-sql.fixture.ts',
    'src/lib/receiving/photo-move-targets.ts',
    'src/app/api/receiving/[id]/route.ts',
    'src/app/api/receiving/lookup-po/route.ts',
  ];
  for (const rel of files) {
    const text = readFileSync(path.join(REPO, rel), 'utf8');
    const joins = text.match(/JOIN sku_catalog sc/g) ?? [];
    assert.ok(joins.length > 0, `${rel} should still join sku_catalog`);
    const constants = text.match(/SKU_CATALOG_JOIN_ON_SQL/g) ?? [];
    assert.ok(
      constants.length >= joins.length,
      `${rel}: ${joins.length} join(s) but ${constants.length} use(s) of the constant`,
    );
  }
});

test('the Ecwid title sync cannot overwrite a catalog row the org acknowledged', () => {
  const text = readFileSync(
    path.join(REPO, 'src/app/api/sku-catalog/sync-ecwid-titles/route.ts'),
    'utf8',
  );
  assert.match(text, /skuCatalogTitleUnownedPredicateSql/);
  assert.deepEqual(auditSkuIdentitySource('route.ts', text), []);
});

test('the ON constant is exact and org-scoped', () => {
  assert.equal(
    SKU_CATALOG_JOIN_ON_SQL,
    'sc.sku = rl.sku AND sc.organization_id = rl.organization_id',
  );
  assert.doesNotMatch(SKU_CATALOG_JOIN_ON_SQL, /regexp_replace|similarity|\^0/);
});
