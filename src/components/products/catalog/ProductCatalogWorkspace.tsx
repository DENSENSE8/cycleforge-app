'use client';

/**
 * Products › Catalog — the catalog list, plus the two ways a product gets in
 * from the desk: Add product (one item, `catalog:add-product`) and Import
 * products CSV (`catalog:import-csv`: the shared table-import picker; while a
 * file is staged, `CatalogImportReview` stands in for the list). Both header
 * actions are declared in `NAV_PAGE_DECLS.products` and gated on
 * `sku_stock.manage`, the create route's permission.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { CATALOG_IMPORT_DESCRIPTOR } from '@/lib/sku/catalog-import-descriptor';
import { clearTableImportDraft, useTableImportDraft } from '@/lib/tables/import/staging-store';
import { toast } from '@/lib/toast';
import type { CatalogListRow } from './types';
import { AddProductOverlay } from './AddProductOverlay';
import { CatalogImportReview } from './CatalogImportReview';
import { ProductCatalogList } from './ProductCatalogList';

type CatalogResponse = { success?: boolean; items?: CatalogListRow[]; total?: number; error?: string };

export const CATALOG_ADD_PRODUCT_INTENT = 'catalog:add-product';
export const CATALOG_IMPORT_CSV_INTENT = 'catalog:import-csv';

export function ProductCatalogWorkspace() {
  const searchParams = useSearchParams();
  const find = searchParams.get('q') ?? '';
  const [rows, setRows] = useState<CatalogListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);

  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const csv = useTableImportFilePicker(CATALOG_IMPORT_DESCRIPTOR);
  const draft = useTableImportDraft(CATALOG_IMPORT_DESCRIPTOR.surfaceId);
  const { active: importActive, setActive: setImportActive } = useTableImportParam(CATALOG_IMPORT_DESCRIPTOR);

  useNavIntent(CATALOG_ADD_PRODUCT_INTENT, canManage ? () => setAdding(true) : null);
  useNavIntent(CATALOG_IMPORT_CSV_INTENT, canManage && csv.live ? csv.open : null);
  const { error: csvError, clearError: clearCsvError } = csv;
  useEffect(() => {
    if (!csvError) return;
    toast.error(csvError);
    clearCsvError();
  }, [csvError, clearCsvError]);

  const closeImport = useCallback(() => {
    setImportActive(false);
    clearTableImportDraft(CATALOG_IMPORT_DESCRIPTOR.surfaceId);
  }, [setImportActive]);
  const reloadCatalog = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const collected: CatalogListRow[] = [];
        let offset = 0;
        let total = 0;
        do {
          const query = new URLSearchParams({ q: find, limit: '500', offset: String(offset), linkFilter: 'all' });
          const response = await fetch(`/api/sku-catalog?${query.toString()}`, { cache: 'no-store', signal: controller.signal });
          const body = (await response.json()) as CatalogResponse;
          if (!response.ok || body.success === false) throw new Error(body.error || `HTTP ${response.status}`);
          const page = body.items ?? [];
          collected.push(...page);
          total = body.total ?? collected.length;
          offset += page.length;
          if (page.length === 0) break;
        } while (offset < total);
        setRows(collected);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Catalog could not be loaded');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [find, reload]);

  const reviewing = importActive && draft != null;

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* The picker's hidden <input>; `csv.open()` (catalog:import-csv) clicks it. */}
      {csv.input}
      {reviewing ? (
        <CatalogImportReview
          draft={draft}
          onClose={closeImport}
          onApplied={() => {
            closeImport();
            setReload((n) => n + 1);
          }}
        />
      ) : (
        <>
          {error ? <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p> : null}
          {!error ? <ProductCatalogList rows={rows} loading={loading} onChanged={reloadCatalog} /> : null}
        </>
      )}
      <AddProductOverlay
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          setReload((n) => n + 1);
        }}
      />
    </main>
  );
}
