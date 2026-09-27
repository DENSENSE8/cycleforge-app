/**
 * In-memory, multi-org BrandStore for DB-free tests. It keeps every org's
 * rows in one place so a test can prove a store bound to org A never reads
 * or writes org B — the same contract sqlBrandStore enforces with
 * `organization_id = $1` on every statement.
 */

import type { BrandNode } from './tree';
import type {
  AliasInsert,
  BrandAliasRow,
  BrandDetail,
  BrandListItem,
  BrandPatch,
  BrandRow,
  BrandStore,
  SkuBrandTriple,
} from './store';

interface MemBrand extends BrandRow {
  orgId: string;
}
interface MemAlias extends BrandAliasRow {
  orgId: string;
}
interface MemSku {
  orgId: string;
  id: number;
  sku: string;
  isActive: boolean;
  brand: SkuBrandTriple;
}

export class MemBrandDb {
  brands: MemBrand[] = [];
  aliases: MemAlias[] = [];
  skus: MemSku[] = [];
  refreshed: Array<{ orgId: string; brandIds: number[] }> = [];
  writes = 0;
  private nextId = 1;

  addBrand(orgId: string, b: Partial<BrandRow> & { name: string }, aliases: string[] = []): MemBrand {
    const row: MemBrand = {
      orgId,
      id: this.nextId++,
      name: b.name,
      slug: b.slug ?? b.name.toLowerCase().replace(/\s+/g, '-'),
      normalizedName: b.normalizedName ?? b.name.toLowerCase(),
      kind: b.kind ?? 'brand',
      parentBrandId: b.parentBrandId ?? null,
      publisher: b.publisher ?? null,
      isActive: b.isActive ?? true,
      createdAt: 't0',
      updatedAt: 't0',
    };
    this.brands.push(row);
    for (const a of [row.normalizedName, ...aliases]) {
      this.aliases.push({ orgId, id: this.nextId++, brandId: row.id, alias: a, normalizedAlias: a, source: 'seed', reviewOnly: false });
    }
    return row;
  }

  store(orgId: string): BrandStore {
    const db = this;
    const own = <T extends { orgId: string }>(rows: T[]) => rows.filter((r) => r.orgId === orgId);
    const strip = <T extends { orgId: string }>({ orgId: _o, ...rest }: T) => rest;
    return {
      orgId,
      async loadTree(): Promise<BrandNode[]> {
        return own(db.brands).map((b) => ({ id: b.id, name: b.name, slug: b.slug, kind: b.kind, parentBrandId: b.parentBrandId, isActive: b.isActive }));
      },
      async listBrands({ q, kind, limit }): Promise<BrandListItem[]> {
        return own(db.brands)
          .filter((b) => b.isActive && (!kind || b.kind === kind))
          .filter((b) => !q || own(db.aliases).some((a) => a.brandId === b.id && a.normalizedAlias.includes(q)))
          .slice(0, limit)
          .map((b) => ({ id: b.id, name: b.name, slug: b.slug, kind: b.kind, parentBrandId: b.parentBrandId, publisher: b.publisher, matchedAlias: null, aliasRank: null, activeSkuCount: 0 }));
      },
      async getBrand(id) {
        const b = own(db.brands).find((x) => x.id === id);
        return b ? strip(b) : null;
      },
      async getBrandDetail(id): Promise<BrandDetail | null> {
        const b = own(db.brands).find((x) => x.id === id);
        if (!b) return null;
        return {
          brand: strip(b),
          aliases: own(db.aliases).filter((a) => a.brandId === id).map(strip),
          parent: null,
          children: [],
          counts: { skuCount: 0, activeSkuCount: 0, openOrderCount: 0, onHandUnits: 0 },
        };
      },
      async listBrandProducts(id) {
        return own(db.skus)
          .filter((s) => s.brand.brandId === id)
          .map((s) => ({
            skuCatalogId: s.id,
            sku: s.sku,
            title: s.sku,
            isActive: s.isActive,
            imageUrl: null,
            brand: { id, name: '', kind: 'brand' as const },
            brandConfidence: s.brand.confidence ?? 0,
            brandSource: s.brand.source ?? '',
            onHandUnits: 0,
          }));
      },
      async listAliases(brandId) {
        return own(db.aliases).filter((a) => a.brandId === brandId).map(strip);
      },
      async findAliasOwners(normalized) {
        return own(db.aliases)
          .filter((a) => normalized.includes(a.normalizedAlias))
          .map((a) => ({ normalizedAlias: a.normalizedAlias, brandId: a.brandId, brandName: own(db.brands).find((b) => b.id === a.brandId)!.name }));
      },
      async findSlugOwner(slug) {
        const b = own(db.brands).find((x) => x.slug === slug);
        return b ? { id: b.id, name: b.name } : null;
      },
      async insertBrand(row) {
        db.writes++;
        const b: MemBrand = { orgId, id: db.nextId++, ...row, isActive: true, createdAt: 't1', updatedAt: 't1' };
        db.brands.push(b);
        return strip(b);
      },
      async updateBrand(id, patch: BrandPatch) {
        db.writes++;
        const b = own(db.brands).find((x) => x.id === id)!;
        Object.assign(b, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: 't2' });
        return strip(b);
      },
      async insertAliases(brandId, aliases: AliasInsert[]) {
        if (aliases.length) db.writes++;
        for (const a of aliases) {
          if (own(db.aliases).some((x) => x.normalizedAlias === a.normalizedAlias)) {
            throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
          }
          db.aliases.push({ orgId, id: db.nextId++, brandId, ...a });
        }
      },
      async deleteAliases(brandId, normalized) {
        if (normalized.length) db.writes++;
        const before = db.aliases.length;
        db.aliases = db.aliases.filter((a) => !(a.orgId === orgId && a.brandId === brandId && normalized.includes(a.normalizedAlias)));
        return before - db.aliases.length;
      },
      async setSkuBrand(skuCatalogId, next) {
        const s = own(db.skus).find((x) => x.id === skuCatalogId);
        if (!s) return null;
        db.writes++;
        const previous = s.brand;
        s.brand = next;
        return previous;
      },
      async writeDerivedBrands(rows) {
        let n = 0;
        for (const r of rows) {
          const s = own(db.skus).find((x) => x.id === r.skuCatalogId);
          if (!s) continue;
          s.brand = { brandId: r.brandId, confidence: r.confidence, source: r.source };
          n++;
        }
        if (n) db.writes++;
        return n;
      },
      async enqueueSearchRefresh(brandIds) {
        db.refreshed.push({ orgId, brandIds });
      },
      async listProposals() {
        return [];
      },
    };
  }
}
