'use client';

import { CatalogManagerList } from '@/components/receiving/workspace/line-edit/CatalogManagerList';
import { PlatformAccountsManager } from '@/components/receiving/workspace/line-edit/PlatformAccountsManager';
import { ShipStationStoreLinks } from '@/components/settings/ShipStationStoreLinks';

/** Settings → Platforms & Types. */
export function CatalogSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-default">Platforms &amp; Types</h2>
        <p className="mt-1 text-sm text-text-soft">
          The sales channels, storefront accounts, and receiving flow types your team picks from
          across receiving and orders. Add, rename, reorder, hide, or delete your own — built-in
          defaults are protected (hide-only, restorable).
        </p>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-text-default">Platforms</h3>
        <p className="mb-3 text-xs text-text-soft">
          Use the <span className="font-semibold">gear</span> on a platform to restrict which
          receiving types it accepts (e.g. FBA only ever arrives as a Return). A platform with
          no rules accepts every type.
        </p>
        <CatalogManagerList kind="platform" enablePlatformRules />
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-text-default">ShipStation stores</h3>
        <p className="mb-3 text-xs text-text-soft">
          Where each store&apos;s orders go: an existing platform, and the storefront account when
          the store is one. The sync never adds a platform or account for a linked store.
        </p>
        <ShipStationStoreLinks />
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-text-default">Storefront accounts</h3>
        <p className="mb-3 text-xs text-text-soft">
          The specific stores under each platform (e.g. your eBay accounts). A flow type can pin one
          so it resolves the right integration.
        </p>
        <PlatformAccountsManager />
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-text-default">Receiving types</h3>
        <p className="mb-3 text-xs text-text-soft">
          Use the <span className="font-semibold">gear</span> on a type to bind it to a storefront
          account or a custom workflow node (e.g. your own repair-service flow).
        </p>
        <CatalogManagerList kind="type" enableTypeBindings />
      </div>
    </div>
  );
}
