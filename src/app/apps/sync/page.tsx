'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ConnectionsSidebarPanel } from '@/components/sidebar/ConnectionsSidebarPanel';
import { ZohoManagementPage } from '@/components/admin/connections/ZohoManagementPage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * `/apps/sync` — the sync tools workbench (ex-Admin › Sync tools; admin
 * dissolution W3c, 2026-09-06). Manual triggers for every connected surface:
 * orders (eBay / Ecwid / exceptions / ShipStation CSV), inventory sync
 * (Zoho token + expected POs + one-off receive import), backfills, the
 * Ecwid→Square catalog push, carrier tracking, and Amazon sync — the same
 * {@link ConnectionsSidebarPanel} controller the admin sidebar mounted,
 * promoted from rail to page. `?page=zoho-management` opens the inventory
 * sync management sheet the Zoho section links to.
 */
function AppsSyncBody() {
  const searchParams = useSearchParams();
  if (searchParams.get('page') === 'zoho-management') {
    return <ZohoManagementPage />;
  }
  return (
    <div className="mx-auto h-full max-w-2xl">
      <ConnectionsSidebarPanel />
    </div>
  );
}

export default function AppsSyncPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
              <LoadingSpinner size="lg" className="text-text-muted" />
            </div>
          }
        >
          <AppsSyncBody />
        </Suspense>
      </main>
    </div>
  );
}
