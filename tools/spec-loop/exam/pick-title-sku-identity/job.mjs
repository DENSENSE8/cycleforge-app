// Exam job: the product name on a pick-face task comes from the SKU identity law.
// Outcome: the Replenishment task list paints a product name the server read.
// Law: src/lib/sku/sku-identity-law.ts — the catalog title (sku_catalog.product_title),
// joined exactly and org-scoped, read through resolveSkuIdentityTitle; an external
// (Zoho / marketplace) name never wins over it.

import { addedCode, at, readBase, verdict } from '../_lib.mjs'

export const job = {
  v: 1,
  id: 'pick-title-sku-identity',
  title: 'Product name on the pick-face replenishment tasks',
  base: '0ff1acb44',
  task:
    'Warehouse › Replenishment lists the pick-face refill tasks by SKU only. Show the product name on each task so whoever restocks the pick face knows what they are carrying.',
  domainFact:
    "One SKU, one title (operator 2026-09-15/27): a product's name is the org's own catalog title, sku_catalog.product_title, joined exactly on SKU and organization (SKU_CATALOG_JOIN_ON_SQL / an organization_id predicate) and read through resolveSkuIdentityTitle; a Zoho item name is only the fallback below it and marketplace listing text never names a SKU.",
  trap:
    'Join Zoho `items` (or marketplace listings) by SKU and COALESCE that external name ahead of the catalog title, often with a tenant-blind `JOIN sku_catalog sc ON sc.sku = …`.',
  lease: ['src/lib/replenishment/**', 'src/app/warehouse/replenishment/**', 'src/app/api/replenishment/**'],
  weight: 1,
}

const PAGE = 'src/app/warehouse/replenishment/page.tsx'
/** `{t.productTitle}` / `{task.name}` — a property read painted as JSX text. */
const PAINTED_NAME = /\{\s*[\w.?]+\.(\w*(?:[Tt]itle|[Nn]ame))\s*\}/g
const CATALOG_JOIN = /\bjoin\s+sku_catalog\s+(?:as\s+)?(\w+)\s+on\s+([^\n]*)/i
/** External name sources: Zoho items, marketplace listing rows, fuzzy title matching. */
const EXTERNAL_SOURCES = [
  [/\b(?:join|from)\s+items\b/i, 'reads the Zoho `items` table directly (only ZOHO_ITEM_TITLE_SQL, as the fallback, may)'],
  [/\bsimilarity\s*\(/i, 'similarity()-matches titles (identity is the exact SKU join)'],
  [/\bzoho_item_title\s*\|\|/, 'chains the Zoho title ahead of the catalog title'],
  [/\bsku_platform_ids\b|\blisting_title\b/i, 'reads marketplace listing text as the product name'],
]

function paintedNames(text) {
  return new Set([...String(text ?? '').matchAll(PAINTED_NAME)].map((m) => m[1]))
}

/** `ctx`: ExamCheckContext (Garisek-OS src/lib/loops/spec/types.ts). */
export async function check(ctx) {
  const reasons = []
  const code = addedCode(ctx.diff)

  // ── Outcome ────────────────────────────────────────────────────────────────
  const before = paintedNames(readBase(ctx, PAGE))
  const fresh = [...paintedNames(ctx.read(PAGE))].filter((f) => !before.has(f))
  if (fresh.length === 0) reasons.push(`outcome: ${PAGE} paints no new product-name field on a task`)

  const joins = code.filter((l) => CATALOG_JOIN.test(l.text))
  const readsCatalog = joins.length > 0 || code.some((l) => /SKU_CATALOG_JOIN_ON_SQL|skuCatalogJoinOnSql\(/.test(l.text))
  if (!readsCatalog) reasons.push('outcome: the task read path never joins the SKU catalog (sku_catalog) for its title')

  // ── Law ────────────────────────────────────────────────────────────────────
  if (!code.some((l) => /\bresolveSkuIdentityTitle\s*\(/.test(l.text))) {
    reasons.push('law: the title is not read through resolveSkuIdentityTitle (src/lib/sku/sku-identity-law.ts)')
  }
  for (const l of joins) {
    const post = String(ctx.read(l.file) ?? '').split('\n')
    const clause = [CATALOG_JOIN.exec(l.text)[2], post[l.line] ?? '', post[l.line + 1] ?? ''].join(' ')
    if (/\.sku\s*=/.test(clause) && !/organization_id|SKU_CATALOG_JOIN_ON_SQL|skuCatalogJoinOnSql/.test(clause)) {
      reasons.push(`law: tenant-blind sku_catalog join (no organization_id) — ${at(l)}`)
    }
  }
  for (const l of code) {
    for (const [re, why] of EXTERNAL_SOURCES) if (re.test(l.text)) reasons.push(`trap: ${why} — ${at(l)}`)
    for (const m of l.text.matchAll(/COALESCE\s*\(([^)]*)\)/gi)) {
      const args = m[1].split(',').map((a) => a.trim())
      const cat = args.findIndex((a) => /product_title/.test(a))
      if (cat > 0) reasons.push(`trap: COALESCE puts ${args[0]} ahead of the catalog title — ${at(l)}`)
    }
  }

  return verdict(reasons, `paints ${fresh.join(', ')} from the org-scoped catalog title via resolveSkuIdentityTitle`)
}
