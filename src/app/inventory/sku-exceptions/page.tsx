import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ExceptionsDesk } from '@/components/exceptions/ExceptionsDesk';
import { EXCEPTION_RECORD_PARAM, exceptionRowKey } from '@/lib/exceptions/types';

export const dynamic = 'force-dynamic';

const SKU_EXCEPTIONS_PATH = '/inventory/sku-exceptions';
const PAIRS_LOCK = { kind: 'pairs' } as const;

/**
 * `/inventory/sku-exceptions` — Inventory › **SKU Exceptions**: the Exceptions
 * hub list locked to Missing pairs (owner 2026-09-28 — one list, two doors).
 * A legacy `?sku=TMP-…` share link opens that placeholder's exception.
 */
export default async function InventorySkuExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sku?: string }>;
}) {
  const { q, sku } = await searchParams;
  if (sku?.trim()) {
    const params = new URLSearchParams({ [EXCEPTION_RECORD_PARAM]: exceptionRowKey('pairs', sku.trim()) });
    if (q?.trim()) params.set('q', q.trim());
    redirect(`${SKU_EXCEPTIONS_PATH}?${params}`);
  }
  return (
    <Suspense fallback={null}>
      <ExceptionsDesk basePath={SKU_EXCEPTIONS_PATH} lock={PAIRS_LOCK} />
    </Suspense>
  );
}
