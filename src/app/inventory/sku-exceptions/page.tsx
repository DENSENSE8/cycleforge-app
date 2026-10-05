import { redirect } from 'next/navigation';
import {
  EXCEPTIONS_PATH,
  EXCEPTION_DOMAIN_PARAM,
  EXCEPTION_KIND_PARAM,
  EXCEPTION_RECORD_PARAM,
  exceptionRowKey,
} from '@/lib/exceptions/types';

export const dynamic = 'force-dynamic';

/**
 * Compatibility route. Exceptions has one visible home: `/exceptions`.
 */
export default async function InventorySkuExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sku?: string }>;
}) {
  const { q, sku } = await searchParams;
  const params = new URLSearchParams({ [EXCEPTION_DOMAIN_PARAM]: 'inventory', [EXCEPTION_KIND_PARAM]: 'pairs' });
  if (sku?.trim()) params.set(EXCEPTION_RECORD_PARAM, exceptionRowKey('pairs', sku.trim()));
  if (q?.trim()) params.set('q', q.trim());
  redirect(`${EXCEPTIONS_PATH}?${params}`);
}
