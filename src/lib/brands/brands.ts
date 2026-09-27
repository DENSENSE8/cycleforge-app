/**
 * Brand CRUD rules — the one place that decides whether a brand / alias
 * write is legal. Callers (routes, the review-queue apply path, the seed
 * script) hand in a BrandStore bound to one org + one transaction.
 *
 * Invariants:
 *   • an alias maps to exactly one brand per org — a collision is an error
 *     (409 naming the owner), never a silent re-point;
 *   • a brand's own name is always one of its aliases, and cannot be removed;
 *   • the tree is acyclic, same-org, at most MAX_BRAND_DEPTH deep, and a
 *     product_line always sits under a parent.
 * Every rule is checked before the first write, so a refusal writes nothing.
 */

import type { SkuBrandTriple, BrandAliasRow, BrandRow, BrandStore } from './store';
import { brandSlug, normalizeBrandName, type BrandAliasSource, type BrandKind } from './normalize';
import { brandAncestors, brandSubtreeIds, MAX_BRAND_DEPTH, type BrandNode } from './tree';

export type BrandWriteResult =
  | { ok: true; brand: BrandRow; aliases: BrandAliasRow[]; changed: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string; collisions?: AliasCollision[] };

export interface AliasCollision {
  alias: string;
  normalizedAlias: string;
  ownerBrandId: number;
  ownerBrandName: string;
}

export interface CreateBrandInput {
  name: string;
  kind?: BrandKind;
  parentBrandId?: number | null;
  publisher?: string | null;
  aliases?: string[];
  /** Provenance of the name + aliases. */
  aliasSource?: BrandAliasSource;
  /** Aliases whose hit may only ever be a review-queue proposal ("sl", "rc"). */
  reviewOnlyAliases?: string[];
}

export interface UpdateBrandInput {
  name?: string;
  kind?: BrandKind;
  parentBrandId?: number | null;
  publisher?: string | null;
  isActive?: boolean;
  aliasesAdd?: string[];
  /** Added as review-only (ambiguous) aliases. */
  reviewOnlyAliasesAdd?: string[];
  aliasesRemove?: string[];
  aliasSource?: BrandAliasSource;
}

interface PlannedAlias {
  alias: string;
  normalizedAlias: string;
}

/** Normalise + dedupe alias texts; empty-after-normalisation texts are reported. */
export function planAliases(texts: readonly string[]): { aliases: PlannedAlias[]; empty: string[] } {
  const seen = new Set<string>();
  const aliases: PlannedAlias[] = [];
  const empty: string[] = [];
  for (const raw of texts) {
    const alias = String(raw ?? '').trim();
    const normalizedAlias = normalizeBrandName(alias);
    if (!normalizedAlias) {
      empty.push(alias);
      continue;
    }
    if (seen.has(normalizedAlias)) continue;
    seen.add(normalizedAlias);
    aliases.push({ alias, normalizedAlias });
  }
  return { aliases, empty };
}

/** Aliases already owned by a DIFFERENT brand. `brandId` null = a brand not yet created. */
export function aliasCollisions(
  planned: readonly PlannedAlias[],
  owners: ReadonlyArray<{ normalizedAlias: string; brandId: number; brandName: string }>,
  brandId: number | null,
): AliasCollision[] {
  const byAlias = new Map(owners.map((o) => [o.normalizedAlias, o]));
  const out: AliasCollision[] = [];
  for (const p of planned) {
    const owner = byAlias.get(p.normalizedAlias);
    if (owner && owner.brandId !== brandId) {
      out.push({ alias: p.alias, normalizedAlias: p.normalizedAlias, ownerBrandId: owner.brandId, ownerBrandName: owner.brandName });
    }
  }
  return out;
}

function collisionError(collisions: AliasCollision[]): BrandWriteResult {
  const list = collisions.map((c) => `"${c.alias}" → ${c.ownerBrandName} (#${c.ownerBrandId})`).join(', ');
  return { ok: false, status: 409, error: `alias already belongs to another brand: ${list}`, collisions };
}

/** Height of the subtree under `id` (1 = leaf). */
function subtreeHeight(nodes: readonly BrandNode[], id: number): number {
  const kids = nodes.filter((n) => n.parentBrandId === id);
  return 1 + Math.max(0, ...kids.map((k) => subtreeHeight(nodes, k.id)));
}

/**
 * Parent legality for `selfId` (null on create): exists in this org's tree,
 * not itself or a descendant, and the resulting chain fits MAX_BRAND_DEPTH.
 */
function checkParent(
  nodes: readonly BrandNode[],
  selfId: number | null,
  parentId: number,
): { ok: true } | { ok: false; status: 400 | 404; error: string } {
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { ok: false, status: 404, error: `parent brand ${parentId} not found` };
  if (selfId != null) {
    if (parentId === selfId) return { ok: false, status: 400, error: 'a brand cannot be its own parent' };
    if (brandSubtreeIds(nodes, [selfId]).includes(parentId)) {
      return { ok: false, status: 400, error: 'parent would create a cycle (it sits under this brand)' };
    }
  }
  const depth = brandAncestors(nodes, parentId).length + 1 + (selfId == null ? 1 : subtreeHeight(nodes, selfId));
  if (depth > MAX_BRAND_DEPTH) {
    return { ok: false, status: 400, error: `brand tree may be at most ${MAX_BRAND_DEPTH} levels deep` };
  }
  return { ok: true };
}

export async function createBrand(store: BrandStore, input: CreateBrandInput): Promise<BrandWriteResult> {
  const name = input.name.trim();
  const normalizedName = normalizeBrandName(name);
  if (!normalizedName) return { ok: false, status: 400, error: 'brand name has no letters or digits' };
  const kind = input.kind ?? 'brand';
  const parentBrandId = input.parentBrandId ?? null;
  if (kind === 'product_line' && parentBrandId == null) {
    return { ok: false, status: 400, error: 'a product_line needs a parent brand' };
  }
  if (parentBrandId != null) {
    const parent = checkParent(await store.loadTree(), null, parentBrandId);
    if (!parent.ok) return parent;
  }

  const reviewOnly = new Set(planAliases(input.reviewOnlyAliases ?? []).aliases.map((a) => a.normalizedAlias));
  const { aliases, empty } = planAliases([name, ...(input.aliases ?? []), ...(input.reviewOnlyAliases ?? [])]);
  if (empty.length) return { ok: false, status: 400, error: `alias has no letters or digits: ${empty.join(', ')}` };
  if (reviewOnly.has(normalizedName)) return { ok: false, status: 400, error: 'the brand name cannot be a review-only alias' };

  const collisions = aliasCollisions(aliases, await store.findAliasOwners(aliases.map((a) => a.normalizedAlias)), null);
  if (collisions.length) return collisionError(collisions);

  const slug = brandSlug(name);
  const slugOwner = await store.findSlugOwner(slug);
  if (slugOwner) return { ok: false, status: 409, error: `slug "${slug}" already belongs to ${slugOwner.name} (#${slugOwner.id})` };

  const brand = await store.insertBrand({
    name,
    slug,
    normalizedName,
    kind,
    parentBrandId,
    publisher: input.publisher?.trim() || null,
  });
  const source = input.aliasSource ?? 'operator';
  await store.insertAliases(
    brand.id,
    aliases.map((a) => ({ ...a, source, reviewOnly: reviewOnly.has(a.normalizedAlias) })),
  );
  return { ok: true, brand, aliases: await store.listAliases(brand.id), changed: true };
}

export async function updateBrand(store: BrandStore, id: number, input: UpdateBrandInput): Promise<BrandWriteResult> {
  const before = await store.getBrand(id);
  if (!before) return { ok: false, status: 404, error: 'brand not found' };

  const name = input.name?.trim();
  const renamed = name !== undefined && name !== before.name;
  const normalizedName = renamed ? normalizeBrandName(name) : before.normalizedName;
  if (!normalizedName) return { ok: false, status: 400, error: 'brand name has no letters or digits' };

  const kind = input.kind ?? before.kind;
  const parentChanged = input.parentBrandId !== undefined && input.parentBrandId !== before.parentBrandId;
  const parentBrandId = input.parentBrandId !== undefined ? input.parentBrandId : before.parentBrandId;
  if (kind === 'product_line' && parentBrandId == null) {
    return { ok: false, status: 400, error: 'a product_line needs a parent brand' };
  }
  if (parentChanged && parentBrandId != null) {
    const parent = checkParent(await store.loadTree(), id, parentBrandId);
    if (!parent.ok) return parent;
  }

  const current = await store.listAliases(id);
  const owned = new Set(current.map((a) => a.normalizedAlias));

  const removal = planAliases(input.aliasesRemove ?? []);
  if (removal.empty.length) return { ok: false, status: 400, error: `alias has no letters or digits: ${removal.empty.join(', ')}` };
  if (removal.aliases.some((a) => a.normalizedAlias === normalizedName)) {
    return { ok: false, status: 400, error: "a brand's own name cannot be removed from its aliases" };
  }
  const notOwned = removal.aliases.filter((a) => !owned.has(a.normalizedAlias));
  if (notOwned.length) {
    return { ok: false, status: 400, error: `not an alias of this brand: ${notOwned.map((a) => a.alias).join(', ')}` };
  }
  const removing = new Set(removal.aliases.map((a) => a.normalizedAlias));

  const reviewOnly = new Set(planAliases(input.reviewOnlyAliasesAdd ?? []).aliases.map((a) => a.normalizedAlias));
  if (reviewOnly.has(normalizedName)) return { ok: false, status: 400, error: 'the brand name cannot be a review-only alias' };
  const addition = planAliases([
    ...(renamed ? [name!] : []),
    ...(input.aliasesAdd ?? []),
    ...(input.reviewOnlyAliasesAdd ?? []),
  ]);
  if (addition.empty.length) return { ok: false, status: 400, error: `alias has no letters or digits: ${addition.empty.join(', ')}` };
  const adding = addition.aliases.filter((a) => !owned.has(a.normalizedAlias) || removing.has(a.normalizedAlias));
  const collisions = aliasCollisions(adding, await store.findAliasOwners(adding.map((a) => a.normalizedAlias)), id);
  if (collisions.length) return collisionError(collisions);

  let slug: string | undefined;
  if (renamed) {
    slug = brandSlug(name!);
    const slugOwner = await store.findSlugOwner(slug);
    if (slugOwner && slugOwner.id !== id) {
      return { ok: false, status: 409, error: `slug "${slug}" already belongs to ${slugOwner.name} (#${slugOwner.id})` };
    }
  }

  const publisherChanged = input.publisher !== undefined && (input.publisher?.trim() || null) !== before.publisher;
  const kindChanged = input.kind !== undefined && input.kind !== before.kind;
  const activeChanged = input.isActive !== undefined && input.isActive !== before.isActive;
  const reAdd = adding.filter((a) => removing.has(a.normalizedAlias));
  const netRemove = [...removing].filter((n) => !reAdd.some((a) => a.normalizedAlias === n));
  const netAdd = adding.filter((a) => !owned.has(a.normalizedAlias));
  const changed = renamed || kindChanged || parentChanged || publisherChanged || activeChanged || netRemove.length > 0 || netAdd.length > 0;
  if (!changed) return { ok: true, brand: before, aliases: current, changed: false };

  const brand =
    renamed || kindChanged || parentChanged || publisherChanged || activeChanged
      ? await store.updateBrand(id, {
          ...(renamed ? { name, slug, normalizedName } : {}),
          ...(kindChanged ? { kind } : {}),
          ...(parentChanged ? { parentBrandId } : {}),
          ...(publisherChanged ? { publisher: input.publisher?.trim() || null } : {}),
          ...(activeChanged ? { isActive: input.isActive } : {}),
        })
      : before;
  await store.deleteAliases(id, netRemove);
  const source = input.aliasSource ?? 'operator';
  await store.insertAliases(id, netAdd.map((a) => ({ ...a, source, reviewOnly: reviewOnly.has(a.normalizedAlias) })));
  // Name, alias, parent and active edits all change what the brand's SKU /
  // order / unit / receiving docs say — re-index the subtree.
  await store.enqueueSearchRefresh([id]);
  return { ok: true, brand, aliases: await store.listAliases(id), changed: true };
}

export type SkuBrandAssignResult =
  | { ok: true; previous: SkuBrandTriple; next: SkuBrandTriple }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Set (or clear, `brandId: null`) one SKU's brand. `next` defaults to a
 * human-confirmed fact (operator, 1.00) — the only way a review-queue
 * proposal lands; `restore` writes an exact prior triple (revert).
 */
export async function assignSkuBrand(
  store: BrandStore,
  input: { skuCatalogId: number; brandId: number | null; restore?: SkuBrandTriple },
): Promise<SkuBrandAssignResult> {
  const next: SkuBrandTriple =
    input.restore ??
    (input.brandId == null
      ? { brandId: null, confidence: null, source: null }
      : { brandId: input.brandId, confidence: 1, source: 'operator' });
  if (next.brandId != null) {
    const brand = await store.getBrand(next.brandId);
    if (!brand) return { ok: false, status: 404, error: `brand ${next.brandId} not found` };
    // A revert restores the exact prior state, even onto a since-retired brand.
    if (!brand.isActive && !input.restore) return { ok: false, status: 400, error: `brand ${brand.name} is inactive` };
  }
  const previous = await store.setSkuBrand(input.skuCatalogId, next);
  if (!previous) return { ok: false, status: 404, error: `sku_catalog ${input.skuCatalogId} not found` };
  return { ok: true, previous, next };
}
