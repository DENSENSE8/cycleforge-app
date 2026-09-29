import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ExceptionsDesk } from '@/components/exceptions/ExceptionsDesk';
import { EXCEPTION_RECORD_PARAM, exceptionRowKey } from '@/lib/exceptions/types';

export const dynamic = 'force-dynamic';

const TRACKING_EXCEPTIONS_PATH = '/inventory/triage';
const TRACKING_LOCK = { kind: 'tracking' } as const;

/**
 * `/inventory/triage` — Inventory › **Tracking Exceptions**: the Exceptions hub
 * list locked to Tracking (owner 2026-09-28 — one list, two doors).
 * `/tracking-exceptions` redirects here; a legacy `?open=<id>` opens that
 * scan's exception.
 */
export default async function InventoryTrackingExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  if (open?.trim()) {
    redirect(`${TRACKING_EXCEPTIONS_PATH}?${new URLSearchParams({ [EXCEPTION_RECORD_PARAM]: exceptionRowKey('tracking', open.trim()) })}`);
  }
  return (
    <Suspense fallback={null}>
      <ExceptionsDesk basePath={TRACKING_EXCEPTIONS_PATH} lock={TRACKING_LOCK} />
    </Suspense>
  );
}
