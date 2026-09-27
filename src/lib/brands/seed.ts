/**
 * Idempotent brand seeding: create what is missing, add missing aliases,
 * never overwrite what an operator already changed (kind, parent, publisher,
 * name) and never re-point an alias another brand owns. A second run over
 * the same spec writes nothing.
 */

import { createBrand, planAliases, updateBrand } from './brands';
import { normalizeBrandName, type BrandKind } from './normalize';
import type { BrandStore } from './store';

export interface BrandSeedSpec {
  name: string;
  kind: BrandKind;
  publisher?: string;
  aliases?: string[];
  /** Ambiguous shorthands ("sl", "am"): a hit only ever proposes. */
  reviewOnlyAliases?: string[];
  children?: BrandSeedSpec[];
}

export interface BrandSeedOutcome {
  name: string;
  brandId: number | null;
  action: 'created' | 'aliases_added' | 'unchanged' | 'skipped';
  aliasesAdded: number;
  /** Aliases left alone because another brand owns them (or the brand itself could not be written). */
  conflicts: string[];
}

async function ensureBrand(
  store: BrandStore,
  spec: BrandSeedSpec,
  parentBrandId: number | null,
  out: BrandSeedOutcome[],
): Promise<number | null> {
  const normalizedName = normalizeBrandName(spec.name);
  const [nameOwner] = await store.findAliasOwners([normalizedName]);
  const all = planAliases([...(spec.aliases ?? []), ...(spec.reviewOnlyAliases ?? [])]).aliases;
  const owners = await store.findAliasOwners(all.map((a) => a.normalizedAlias));
  const reviewOnly = new Set(planAliases(spec.reviewOnlyAliases ?? []).aliases.map((a) => a.normalizedAlias));

  let brandId: number | null = null;
  let outcome: BrandSeedOutcome;
  if (!nameOwner) {
    const free = all.filter((a) => !owners.some((o) => o.normalizedAlias === a.normalizedAlias));
    const r = await createBrand(store, {
      name: spec.name,
      kind: spec.kind,
      parentBrandId,
      publisher: spec.publisher ?? null,
      aliases: free.filter((a) => !reviewOnly.has(a.normalizedAlias)).map((a) => a.alias),
      reviewOnlyAliases: free.filter((a) => reviewOnly.has(a.normalizedAlias)).map((a) => a.alias),
      aliasSource: 'seed',
    });
    const conflicts = owners.map((o) => `${o.normalizedAlias} → ${o.brandName}`);
    if (!r.ok) {
      out.push({ name: spec.name, brandId: null, action: 'skipped', aliasesAdded: 0, conflicts: [...conflicts, r.error] });
      return null;
    }
    brandId = r.brand.id;
    outcome = { name: spec.name, brandId, action: 'created', aliasesAdded: r.aliases.length, conflicts };
  } else {
    // The brand that owns the seed name IS the seeded brand (an operator may have renamed it since).
    brandId = nameOwner.brandId;
    const foreign = owners.filter((o) => o.brandId !== brandId);
    const missing = all.filter((a) => !owners.some((o) => o.normalizedAlias === a.normalizedAlias));
    const conflicts = foreign.map((o) => `${o.normalizedAlias} → ${o.brandName}`);
    if (missing.length === 0) {
      outcome = { name: spec.name, brandId, action: 'unchanged', aliasesAdded: 0, conflicts };
    } else {
      const r = await updateBrand(store, brandId, {
        aliasesAdd: missing.filter((a) => !reviewOnly.has(a.normalizedAlias)).map((a) => a.alias),
        reviewOnlyAliasesAdd: missing.filter((a) => reviewOnly.has(a.normalizedAlias)).map((a) => a.alias),
        aliasSource: 'seed',
      });
      outcome = r.ok
        ? { name: spec.name, brandId, action: 'aliases_added', aliasesAdded: missing.length, conflicts }
        : { name: spec.name, brandId, action: 'skipped', aliasesAdded: 0, conflicts: [...conflicts, r.error] };
    }
  }
  out.push(outcome);
  for (const child of spec.children ?? []) await ensureBrand(store, child, brandId, out);
  return brandId;
}

export async function seedBrands(store: BrandStore, specs: readonly BrandSeedSpec[]): Promise<BrandSeedOutcome[]> {
  const out: BrandSeedOutcome[] = [];
  for (const spec of specs) await ensureBrand(store, spec, null, out);
  return out;
}
