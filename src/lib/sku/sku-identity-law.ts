/**
 * THE SKU IDENTITY LAW — one SKU, one title, one photo, everywhere.
 *
 * Operator 2026-09-15: *"it all needs to be ported under one source of truth
 * which would be the ZOHOSKU … it must be string swapped and it must display
 * the ZOHO SKU, title and more."*
 *
 * ## The failure this replaces
 *
 * PO `10-15153-01528` (carton 52827, line 32354, `rl.sku = '00143'`) painted
 * **"Bose Solo Soundbar 2 Home Theater"** on the PO desk and **"1x Original
 * Bose UB-20 Wall Mount … UB-20B (BLACK)"** in Move photos — same row, two
 * products. Same class: catalog SKU `00031` read "Bose SoundDock 10 remote
 * control" while Zoho says "Bose Wave Music System"; `00017` read a CineMate
 * remote while Zoho says "Bose Wave Radio II". Measured on prod 2026-09-15:
 * **132 of 1118** Zoho-twinned catalog rows carried a title that disagreed
 * with `items.name`, **155** were byte-equal to a marketplace listing title,
 * **132 of 139** catalog images shadowed a Zoho item photo, and **77**
 * `serial_units` were bound through one.
 *
 * ## The key was never broken — the column was
 *
 * Earlier diagnosis blamed a cross-namespace collision on the SKU string and
 * "fixed" it with a `similarity(sc.product_title, …) >= 0.25` join predicate.
 * That was wrong, and the data says so:
 *
 * | measurement (prod, 2026-09-15) | value |
 * |---|---|
 * | `UNIQUE (organization_id, sku)` on `sku_catalog` | already enforced |
 * | distinct active Zoho SKUs / of those with an exact catalog twin | 1118 / **1118** |
 * | Zoho SKUs mapping to >1 `zoho_item_id` | **0** |
 * | receiving lines where the exact org-scoped join disagreed with `rz.zoho_item_id` | **0 / 2862** |
 * | `sku_catalog.provider_item_id` conflicting with the Zoho twin | **0** |
 *
 * The exact, org-scoped string join is total and unambiguous. What poisoned
 * the display was the WRITE side: `/api/sku-catalog/sync-ecwid-titles`
 * overwrote `sku_catalog.product_title` / `image_url` with Ecwid text for
 * every SKU string it matched, Zoho-owned rows included. The similarity guard
 * was a contamination detector wired into a read path — so it silently
 * discarded a CORRECT catalog row, and the six readers that never copied it
 * rendered the marketplace product with full confidence.
 *
 * ## The law
 *
 * 1. **Key** — `sku_catalog` is reached by `sc.sku = rl.sku AND
 *    sc.organization_id = rl.organization_id`. Exact. Org-scoped. Never
 *    leading-zero-stripped, never similarity-gated, never tenant-blind.
 *    {@link SKU_CATALOG_JOIN_ON_SQL}.
 * 2. **Title** — the Zoho item name governs when a Zoho item exists; the
 *    marketplace title is the fallback for the 755 marketplace-sourced lines
 *    that have no `zoho_item_id`. {@link resolveSkuIdentityTitle}.
 * 3. **Photo** — identical precedence, and it already shipped correctly once:
 *    `RECEIVING_LINE_IMAGE_URL_SQL` (`lines/sql-receiving-image.ts`) is the
 *    reference implementation this law generalizes.
 * 4. **Ownership** — a Zoho-twinned catalog row's `product_title` / `image_url`
 *    belong to Zoho. Marketplace text lives in `sku_platform_ids.display_name`
 *    / `listing_title`, which already holds it. A platform sync may write the
 *    catalog columns ONLY through {@link skuCatalogNoZohoTwinPredicateSql}.
 *
 * Three docblocks already asserted rule 2 — `get-title-by-sku/route.ts:30-36`,
 * `lines/build-sql.ts`, `lines/sql-receiving-image.ts:6-9` — and nothing
 * enforced it, which is exactly how ten call sites drifted. So: this module is
 * the rule, `sku-identity-law.test.ts` is the hard gate, `scripts/
 * sku-identity-guard.ts` is the CLI, and `ds_sku_identity` is the MCP face.
 *
 * Leaf module — imports nothing, so the test, the guard and the adjudicator
 * can all load it.
 */

/**
 * The ONLY `ON` predicate for a `sku_catalog` join off a receiving line.
 *
 * Aliases are fixed (`sc`, `rl`) because all ten call sites already use them;
 * a fixed string is what lets the guard grep for compliance instead of
 * re-parsing SQL.
 */
export const SKU_CATALOG_JOIN_ON_SQL =
  'sc.sku = rl.sku AND sc.organization_id = rl.organization_id' as const;

/**
 * The Zoho item title subquery — rule 2's winning arm.
 *
 * Correlated on `rz.zoho_item_id` (`receiving_line_zoho`), `status = 'active'`,
 * so a retired Zoho item degrades to the marketplace title rather than
 * blanking the row.
 */
export const ZOHO_ITEM_TITLE_SQL = `(SELECT name FROM items
                  WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
                  LIMIT 1)` as const;

/**
 * Write-side ownership predicate (rule 4). A platform title/image sync appends
 * this to its `WHERE` so it can only fill rows Zoho does not own.
 *
 * Org-aligned across the SKU string, same as rule 1: without it a Zoho item in
 * another tenant would decide whether THIS tenant's row is Zoho-owned.
 *
 * @param alias table being updated — `sku_catalog` in an `UPDATE … WHERE`.
 */
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

/**
 * Pure text audit of one file — no fs, so the test, the guard script and the
 * MCP adjudicator share exactly one implementation.
 *
 * Deliberately line-oriented and conservative: it recognizes the shapes that
 * actually drifted (a hand-written `ON`, a `similarity()` title gate, a
 * `catalog_product_title ||` ladder head, an unguarded catalog title `UPDATE`)
 * rather than pretending to parse SQL.
 */
export function auditSkuIdentitySource(file: string, text: string): SkuIdentityViolation[] {
  if ((SKU_IDENTITY_SCAN_EXEMPT as readonly string[]).includes(file)) return [];

  const out: SkuIdentityViolation[] = [];
  const lines = text.split('\n');
  const push = (kind: SkuIdentityViolationKind, i: number) =>
    out.push({ kind, file, line: i + 1, excerpt: lines[i].trim().slice(0, 160) });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A join's ON clause may wrap; the org predicate often sits on the next
    // line or two. The KEY, though, is read from the ON expression alone —
    // widening that window let a following `items` join's `zi.sku = o.sku`
    // mis-key an id-keyed catalog join as identity.
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

    // Ladder order, POSITIONALLY: the marketplace title may appear in a `||`
    // chain, but never ahead of the Zoho item title. A chain that names
    // neither order (no `zoho_item_title` at all) is also wrong — it cannot
    // reach the SoT.
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
