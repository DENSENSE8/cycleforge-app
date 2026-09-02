import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pairManualToSku,
  type PairManualToSkuDeps,
} from './pair-manual-to-sku';
import type { ProductManual } from '@/lib/neon/product-manuals-queries';

const ORG = '00000000-0000-0000-0000-000000000001' as const;

function fakeManual(overrides: Partial<ProductManual> = {}): ProductManual {
  return {
    id: 42,
    sku: null,
    item_number: null,
    product_title: 'Widget',
    display_name: 'Widget Manual',
    google_file_id: null,
    source_url: 'https://example.com/m.pdf',
    relative_path: null,
    folder_path: null,
    file_name: 'widget.pdf',
    status: 'unassigned',
    assigned_at: null,
    assigned_by: null,
    type: null,
    thumbnail_url: null,
    is_active: true,
    sku_catalog_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

interface Captured {
  resolveArgs: unknown[];
  setArgs: Array<{ manualId: number; skuCatalogId: number | null; orgId: string }>;
  promoteArgs: Array<{ orgId: string; manualId: number; skuCatalogId: number }>;
}

function fakes(opts?: {
  resolveId?: number | null;
  getManual?: ProductManual | null;
  setResult?: ProductManual | null;
  promoteFail?: boolean;
}) {
  const cap: Captured = { resolveArgs: [], setArgs: [], promoteArgs: [] };
  const deps: PairManualToSkuDeps = {
    resolveOrCreateSkuCatalogId: async (params, orgId) => {
      cap.resolveArgs.push({ params, orgId });
      return opts?.resolveId === undefined ? 99 : opts.resolveId;
    },
    getProductManualById: async () =>
      opts?.getManual === undefined ? fakeManual() : opts.getManual,
    setManualSkuCatalogId: async (manualId, skuCatalogId, orgId) => {
      cap.setArgs.push({ manualId, skuCatalogId, orgId: String(orgId) });
      if (opts?.setResult === null) return null;
      return (
        opts?.setResult ??
        fakeManual({
          id: manualId,
          sku_catalog_id: skuCatalogId,
          status: 'assigned',
        })
      );
    },
    promoteProductManualToDocument: async (orgId, manualId, skuCatalogId) => {
      cap.promoteArgs.push({ orgId: String(orgId), manualId, skuCatalogId });
      if (opts?.promoteFail) throw new Error('promote boom');
      return {
        documentId: 7,
        productManualId: manualId,
        displayName: 'Widget Manual',
        sourceUrl: null,
        fileName: null,
        manualType: null,
        skuCatalogId,
      };
    },
  };
  return { deps, cap };
}

test('pairManualToSku: requires SKU', async () => {
  const { deps, cap } = fakes();
  const out = await pairManualToSku(
    { orgId: ORG, manualId: 42, sku: '  ' },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(cap.setArgs.length, 0);
});

test('pairManualToSku: 404 when manual missing', async () => {
  const { deps, cap } = fakes({ getManual: null });
  const out = await pairManualToSku(
    { orgId: ORG, manualId: 42, sku: 'SKU-1' },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 404);
  assert.equal(cap.resolveArgs.length, 0);
});

test('pairManualToSku: happy path resolves catalog, pairs, promotes for pack', async () => {
  const { deps, cap } = fakes();
  const out = await pairManualToSku(
    {
      orgId: ORG,
      manualId: 42,
      sku: 'SKU-1',
      productTitle: 'Widget Pro',
      orderId: 'ORD-9',
    },
    deps,
  );
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.skuCatalogId, 99);
  assert.equal(out.documentId, 7);
  assert.equal(cap.resolveArgs.length, 1);
  assert.deepEqual(cap.setArgs[0], {
    manualId: 42,
    skuCatalogId: 99,
    orgId: ORG,
  });
  assert.deepEqual(cap.promoteArgs[0], {
    orgId: ORG,
    manualId: 42,
    skuCatalogId: 99,
  });
});

test('pairManualToSku: catalog resolve miss → 409, no pair write', async () => {
  const { deps, cap } = fakes({ resolveId: null });
  const out = await pairManualToSku(
    { orgId: ORG, manualId: 42, sku: 'SKU-1' },
    deps,
  );
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 409);
  assert.equal(cap.setArgs.length, 0);
  assert.equal(cap.promoteArgs.length, 0);
});

test('pairManualToSku: promote failure still returns paired (order→shipped pack path)', async () => {
  const { deps, cap } = fakes({ promoteFail: true });
  const out = await pairManualToSku(
    { orgId: ORG, manualId: 42, sku: 'SKU-1' },
    deps,
  );
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.documentId, null);
  assert.equal(cap.setArgs.length, 1);
});
