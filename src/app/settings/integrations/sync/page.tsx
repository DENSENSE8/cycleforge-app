'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/pane-header';
import { ConnectionsSidebarPanel } from '@/components/sidebar/ConnectionsSidebarPanel';
import { ZohoManagementPage } from '@/components/admin/connections/ZohoManagementPage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * `/settings/integrations/sync` — the sync tools workbench (ex-Admin › Sync
 * tools; admin dissolution). Manual triggers for every connected surface:
 * order exceptions (Ecwid tracking + clearing resolved), eBay token refresh,
 * inventory sync (Zoho token + expected POs + one-off receive import),
 * backfills, the Ecwid→Square catalog push, carrier tracking, and Amazon
 * connection checks — the same
 * {@link ConnectionsSidebarPanel} controller the admin sidebar mounted,
 * promoted from rail to page. `?page=zoho-management` opens the inventory sync
 * management sheet the Zoho section links to.
 *
 * It lives under Settings › Apps & integrations because this tree has no
 * `/apps` marketplace route — the same reason `settings-sections.ts` keeps
 * `integrations` at `/settings/integrations`.
 */
function SyncToolsBody() {
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

export default function SettingsSyncToolsPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <PageHeader
        eyebrow="Apps & integrations"
        value="Sync tools"
        backHref="/settings/integrations"
        maxWidth="2xl"
      />
      <h1 className="sr-only">Sync tools</h1>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
              <LoadingSpinner size="lg" className="text-text-muted" />
            </div>
          }
        >
          <SyncToolsBody />
        </Suspense>
      </div>
    </div>
  );
}
