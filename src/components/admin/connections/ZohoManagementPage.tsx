'use client';

import Link from 'next/link';
import { ExternalLink } from '@/components/Icons';
import { ZohoInboundStatusBanner } from '@/components/receiving/ZohoInboundStatusBanner';
import { ZohoSyncCard } from '@/components/admin/connections/ZohoSyncCard';
import { integrationsHubHref } from '@/lib/integrations/capability-labels';

export function ZohoManagementPage() {
  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-surface-card">
      <div className="border-b border-border-soft px-6 py-5">
        <p className="text-role-micro uppercase tracking-[0.24em] text-text-soft">Connections</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-text-default">Inventory sync tools</h2>
            <p className="mt-1 text-role-caption font-semibold leading-relaxed text-text-soft">
              Refresh the inventory connector&apos;s token, sync expected receiving lines, and import a single purchase receive from one place.
            </p>
            <p className="mt-1.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
              Connector: Zoho Inventory
            </p>
          </div>
          <Link
            href={integrationsHubHref('zoho')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-soft bg-surface-canvas inset-field text-role-eyebrow uppercase tracking-widest text-text-default transition-colors hover:bg-surface-sunken"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Manage connection in Settings → Integrations
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ZohoInboundStatusBanner />
        <div className="px-6 py-5">
          <ZohoSyncCard embedded />
        </div>
      </div>
    </section>
  );
}
