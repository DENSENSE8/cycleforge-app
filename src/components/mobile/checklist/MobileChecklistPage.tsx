'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { fetchDashboardOrderRowById } from '@/lib/dashboard-table-data';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { MobileChecklistOrderQueue } from '@/components/mobile/checklist/MobileChecklistOrderQueue';
import {
  MobileChecklistEditor,
  type ChecklistEditorContext,
} from '@/components/mobile/checklist/MobileChecklistEditor';

function catalogIdFromOrder(order: ShippedOrder): number | null {
  const raw = (order as ShippedOrder & { sku_catalog_id?: unknown }).sku_catalog_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * `/m/checklist` — order-first kit/QC authoring.
 *
 * Landing: pending-order queue with search (title + item #).
 * Editor: `?orderRowId=` (primary), or deep links `?itemNumber=` / `?skuId=`.
 * `?q=` is preserved when opening/closing the editor.
 */
export function MobileChecklistPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get('q') || '').trim();
  const orderRowIdRaw = Number(searchParams.get('orderRowId') || '');
  const orderRowId =
    Number.isFinite(orderRowIdRaw) && orderRowIdRaw > 0 ? orderRowIdRaw : null;
  const paramItem = (searchParams.get('itemNumber') || '').trim();
  const paramSkuId = Number(searchParams.get('skuId') || searchParams.get('catalogId') || '');
  const deepCatalogId =
    Number.isFinite(paramSkuId) && paramSkuId > 0 ? paramSkuId : null;

  const inEditor = orderRowId != null || Boolean(paramItem) || deepCatalogId != null;

  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [editorContext, setEditorContext] = useState<ChecklistEditorContext | null>(null);

  useEffect(() => {
    if (!inEditor) {
      setEditorContext(null);
      setOrderError(null);
      setOrderLoading(false);
      return;
    }

    let cancelled = false;

    if (orderRowId != null) {
      setOrderLoading(true);
      setOrderError(null);
      void (async () => {
        try {
          const row = await fetchDashboardOrderRowById(orderRowId);
          if (cancelled) return;
          if (!row) {
            setOrderError('Order not found');
            setEditorContext(null);
            return;
          }
          setEditorContext({
            itemNumber: (row.item_number || '').trim() || null,
            catalogId: catalogIdFromOrder(row),
            productTitle: (row.product_title || '').trim() || null,
            orderLabel: (row.order_id || String(row.id)).trim() || null,
            sku: (row.sku || '').trim() || null,
          });
        } catch (err) {
          if (!cancelled) {
            setOrderError(err instanceof Error ? err.message : 'Failed to load order');
            setEditorContext(null);
          }
        } finally {
          if (!cancelled) setOrderLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Deep link: itemNumber / skuId without an order row.
    setEditorContext({
      itemNumber: paramItem || null,
      catalogId: deepCatalogId,
      productTitle: null,
      orderLabel: null,
      sku: null,
    });
    setOrderLoading(false);
    setOrderError(null);
    return () => {
      cancelled = true;
    };
  }, [inEditor, orderRowId, paramItem, deepCatalogId]);

  const backToQueue = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const qs = params.toString();
    router.replace(qs ? `/m/checklist?${qs}` : '/m/checklist');
  }, [router, q]);

  const onCatalogResolved = useCallback(
    (catalogId: number) => {
      const params = new URLSearchParams();
      if (orderRowId != null) params.set('orderRowId', String(orderRowId));
      if (paramItem) params.set('itemNumber', paramItem);
      params.set('skuId', String(catalogId));
      if (q) params.set('q', q);
      router.replace(`/m/checklist?${params.toString()}`);
      setEditorContext((prev) => (prev ? { ...prev, catalogId } : prev));
    },
    [router, orderRowId, paramItem, q],
  );

  if (!inEditor) {
    return <MobileChecklistOrderQueue initialQuery={q} />;
  }

  if (orderLoading) {
    return (
      <div className={`flex h-full items-center justify-center gap-2 ${TOKENS.colors.background}`}>
        <Loader2 className="h-5 w-5 animate-spin text-text-soft" />
        <span className="text-role-caption font-semibold text-text-soft">Loading order…</span>
      </div>
    );
  }

  if (orderError || !editorContext) {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-3 px-6 ${TOKENS.colors.background}`}>
        <p className="text-center text-role-caption font-semibold text-rose-700">
          {orderError || 'Could not open checklist'}
        </p>
        <Button variant="secondary" size="sm" onClick={backToQueue}>
          Back to orders
        </Button>
      </div>
    );
  }

  return (
    <MobileChecklistEditor
      context={editorContext}
      onBack={backToQueue}
      onCatalogResolved={onCatalogResolved}
    />
  );
}
