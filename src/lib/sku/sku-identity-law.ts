/**
 * THE SKU IDENTITY LAW — one SKU, one title, one photo, everywhere.
 * Operator 2026-09-15: *"it all needs to be ported under one source of truth
 */

/** The ONLY `ON` predicate for a `sku_catalog` join off a receiving line. */
export const SKU_CATALOG_JOIN_ON_SQL =
  'sc.sku = rl.sku AND sc.organization_id = rl.organization_id' as const;

/** The Zoho item title subquery — rule 2's winning arm. */
export const ZOHO_ITEM_TITLE_SQL = `(SELECT name FROM items
                  WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
                  LIMIT 1)` as const;

/** Write-side ownership predicate (rule 4). */
export function skuCatalogNoZohoTwinPredicateSql(alias = 'sku_catalog'): string {
  return `NOT EXISTS (SELECT 1 FROM items i
             WHERE i.sku = ${alias}.sku
               AND i.organization_id = ${alias}.organization_id
               AND i.status = 'active')`;
}

/**
 * Title precedence, most authoritative first. Exported as data so the test can
 * assert consumer ladders against it rather than restating the order.
 */
export const SKU_IDENTITY_TITLE_ORDER = [
  'zoho_item_title',
  'catalog_product_title',
  'item_name',
  'sku',
  'zoho_item_id',
] as const;

export type SkuIdentityTitleField = (typeof SKU_IDENTITY_TITLE_ORDER)[number];

/**
 * The `'Unfound PO'` stub sentinel. A receiving line with no matched PO carries
 * it in `item_name`; it is a placeholder, not a product, so it must never win
 * the ladder ahead of a real later field.
 */
export const UNFOUND_PO_TITLE_STUB = 'Unfound PO' as const;

/**
 * One candidate's face: trimmed, with blanks and the stub sentinel treated as
 * absent so a later real field (or the caller's own fallback) can win.
 */
export function skuIdentityField(value?: string | null): string {
  const t = String(value ?? '').trim();
  if (!t || t === UNFOUND_PO_TITLE_STUB) return '';
  return t;
}

export interface SkuIdentityTitleRow {
  /** `items.name` for `rz.zoho_item_id` — the SoT. */
  zoho_item_title?: string | null;
  /** `sku_catalog.product_title` — marketplace-owned unless a Zoho twin exists. */
  catalog_product_title?: string | null;
  /** The PO line's own listing-style description. */
  item_name?: string | null;
  sku?: string | null;
  zoho_item_id?: string | null;
}

/**
 * Rule 2 in one place. Returns `''` when the row carries no product field at
 * all — the caller owns its own last resort (`Line #N`, `Unfound PO`, a PO
 * summary), because those differ per surface and are not identity.
 */
export function resolveSkuIdentityTitle(row: SkuIdentityTitleRow): string {
  for (const field of SKU_IDENTITY_TITLE_ORDER) {
    const face = skuIdentityField(row[field]);
    if (face) return face;
  }
  return '';
}

/** The sentence a refusal prints — one place, so gate and tool agree. */
export const SKU_IDENTITY_REFUSAL =
  'One SKU, one title, one photo (operator 2026-09-15). Join sku_catalog with SKU_CATALOG_JOIN_ON_SQL — exact and org-scoped, never similarity-gated. Read the title through resolveSkuIdentityTitle: the Zoho item name governs, the marketplace title is the no-Zoho-item fallback. A platform sync may fill sku_catalog.product_title / image_url only behind skuCatalogNoZohoTwinPredicateSql(); marketplace text belongs in sku_platform_ids.display_name.' as const;

export type SkuIdentityViolationKind =
  /** A `sku_catalog` join whose `ON` clause omits `organization_id`. */
  | 'tenant-blind-join'
  /** A read path gating `sku_catalog.product_title` behind `similarity()`. */
  | 'title-similarity-guard'
  /** A TS ladder reading the marketplace title before the Zoho item title. */
  | 'marketplace-title-first'
  /** An `UPDATE sku_catalog` touching title/image with no Zoho-twin predicate. */
  | 'platform-title-write';

export interface SkuIdentityViolation {
  kind: SkuIdentityViolationKind;
  file: string;
  line: number;
  excerpt: string;
}

/** Files that legitimately contain a pattern this scan otherwise refuses. */
export const SKU_IDENTITY_SCAN_EXEMPT = [
  // This module states the patterns it forbids.
  'src/lib/sku/sku-identity-law.ts',
  'src/lib/sku/sku-identity-law.test.ts',
  // Fuzzy PAIRING / title→catalog SEARCH — operator-confirmed candidates and
  // text lookups, never identity resolution. `similarity(product_title, …)` is
  // the point of these queries, not a contamination workaround.
  'src/app/api/sku-catalog/pair-suggestions/route.ts',
  'src/app/api/sku-catalog/suggest-for-item/route.ts',
  'src/lib/neon/pairing-queries.ts',
] as const;

const JOIN_RE = /join\s+sku_catalog\s+(?:as\s+)?(\w+)\s+on\s+([^\n]*)/i;
const SIMILARITY_TITLE_RE = /similarity\s*\(\s*(?:lower\s*\(\s*)?\w*\.?product_title/i;
const UPDATE_SKU_CATALOG_RE = /update\s+sku_catalog\b/i;
const COMMENT_RE = /^\s*(\/\/|\*|--)/;
/** The write-side predicate, literal or interpolated from the law. */
const ZOHO_TWIN_GUARD_RE =
  /skuCatalogNoZohoTwinPredicateSql|NOT EXISTS[\s\S]{0,160}?\bitems\b[\s\S]{0,200}?\bstatus\b/;

/** Pure text audit of one file — no fs, so the test, the guard script and the MCP adjudicator share exactly one implementation. */
export function auditSkuIdentitySource(file: string, text: string): SkuIdentityViolation[] {
  if ((SKU_IDENTITY_SCAN_EXEMPT as readonly string[]).includes(file)) return [];

  const out: SkuIdentityViolation[] = [];
  const lines = text.split('\n');
  const push = (kind: SkuIdentityViolationKind, i: number) =>
    out.push({ kind, file, line: i + 1, excerpt: lines[i].trim().slice(0, 160) });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A join's ON clause may wrap; the org predicate often sits on the next line or two.
    const join = JOIN_RE.exec(line);
    if (join) {
      const onExpr = join[2];
      const clause = [onExpr, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ');
      const usesConstant = /SKU_CATALOG_JOIN_ON_SQL/.test(clause);
      // Only SKU-STRING-keyed joins are identity. An id-keyed join
      // (`sc.id = spi.sku_catalog_id`) rides an already-resolved row and is
      // out of scope — flagging it would be noise, not a verdict.
      const skuKeyed = /\.sku\s*=/.test(onExpr);
      if (skuKeyed && !usesConstant && !/organization_id/.test(clause)) {
        push('tenant-blind-join', i);
      }
      if (skuKeyed && SIMILARITY_TITLE_RE.test(clause)) push('title-similarity-guard', i);
    }

    // `similarity(... product_title ...)` in a join predicate block, several
    // lines below the JOIN keyword — the shape the 0.25 guard had.
    if (SIMILARITY_TITLE_RE.test(line) && /\bGREATEST\b/.test(line)) {
      const already = out.some((v) => v.kind === 'title-similarity-guard' && v.line >= i - 2);
      if (!already) push('title-similarity-guard', i);
    }

    // Ladder order, POSITIONALLY:
    if (/catalog_product_title\s*\|\|/.test(line) && !COMMENT_RE.test(line)) {
      // Forward-only: the chain starts on THIS line, so a `zoho_item_title`
      // sitting in a type declaration four lines above must not absolve it.
      const chain = lines.slice(i, i + 6).join('\n');
      const cat = chain.indexOf('catalog_product_title');
      const zoho = chain.indexOf('zoho_item_title');
      if (zoho === -1 || cat < zoho) push('marketplace-title-first', i);
    }

    if (UPDATE_SKU_CATALOG_RE.test(line) && !COMMENT_RE.test(line)) {
      const block = lines.slice(i, i + 14).join('\n');
      const touchesOwned = /\b(product_title|image_url)\s*=/.test(block);
      if (touchesOwned && !ZOHO_TWIN_GUARD_RE.test(block)) push('platform-title-write', i);
    }
  }

  return out;
}

/** One-line face for the guard, the gate and the MCP verdict. */
export function formatSkuIdentityViolation(v: SkuIdentityViolation): string {
  const why: Record<SkuIdentityViolationKind, string> = {
    'tenant-blind-join':
      'sku_catalog join is not org-scoped — use SKU_CATALOG_JOIN_ON_SQL',
    'title-similarity-guard':
      'similarity() gate on product_title — delete it; the exact org-scoped join is total (0/2862 disagreements)',
    'marketplace-title-first':
      'marketplace title read before the Zoho item title — use resolveSkuIdentityTitle',
    'platform-title-write':
      'UPDATE sku_catalog sets product_title/image_url with no Zoho-twin predicate — add skuCatalogNoZohoTwinPredicateSql()',
  };
  return `${v.file}:${v.line} — ${why[v.kind]}\n      ${v.excerpt}`;
}
