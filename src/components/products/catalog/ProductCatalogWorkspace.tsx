'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { productDetailHref } from '@/components/products/products-view';
import type { CatalogListRow } from './types';
import { useCatalogSpreadsheet } from './catalog-grid/useCatalogSpreadsheet';

type CatalogResponse = { success?: boolean; items?: CatalogListRow[]; total?: number; error?: string };

export function ProductCatalogWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const find = searchParams.get('q') ?? '';
  const [rows, setRows] = useState<CatalogListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [find]);

  const sheet = useCatalogSpreadsheet({
    rows,
    loading,
    find,
    onOpenRow: (row) => router.push(productDetailHref(row.sku)),
  });

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col p-3">
      {error ? <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p> : null}
      {!error ? <DataTable {...sheet} totalCount={rows.length} /> : null}
    </main>
  );
}
