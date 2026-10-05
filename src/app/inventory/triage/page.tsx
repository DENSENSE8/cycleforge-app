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
export default async function InventoryTrackingExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  const params = new URLSearchParams({ [EXCEPTION_DOMAIN_PARAM]: 'inventory', [EXCEPTION_KIND_PARAM]: 'tracking' });
  if (open?.trim()) params.set(EXCEPTION_RECORD_PARAM, exceptionRowKey('tracking', open.trim()));
  redirect(`${EXCEPTIONS_PATH}?${params}`);
}
