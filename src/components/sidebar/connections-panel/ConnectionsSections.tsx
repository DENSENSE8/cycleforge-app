import Link from 'next/link';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { SidebarSection, LineItem, ActionButton } from './connections-panel-pieces';
import type { ConnectionsPanelController } from './useConnectionsPanel';

export function OrdersSection({ c }: { c: ConnectionsPanelController }) {
  return (
    <SidebarSection title="Orders" expanded={c.showOrders} onToggle={() => c.setShowOrders((v) => !v)}>
      <LineItem label="Run Full Order Sync" detail="Run eBay sync, Ecwid exception sync, then clear resolved exceptions" right={<ActionButton onClick={() => c.fullIntegrityMutation.mutate()} loading={c.fullIntegrityMutation.isPending} title="Run full order sync" label="Run" tone="success" />} />
      <LineItem label="Sync eBay Orders" detail="Pull eBay changes and reconcile order exceptions" right={<ActionButton onClick={() => c.ebaySyncMutation.mutate()} loading={c.ebaySyncMutation.isPending} title="Sync eBay orders" label="Sync" tone="info" />} />
      <LineItem label="Sync Ecwid Exceptions" detail="Copy tracking updates onto open Ecwid exceptions" right={<ActionButton onClick={() => c.ecwidExceptionTrackingMutation.mutate()} loading={c.ecwidExceptionTrackingMutation.isPending} title="Sync Ecwid exceptions" label="Sync" tone="info" />} />
      <LineItem label="Clear Resolved Exceptions" detail="Remove exception rows that no longer need attention" right={<ActionButton onClick={() => c.exceptionsSyncMutation.mutate()} loading={c.exceptionsSyncMutation.isPending} title="Clear resolved exceptions" label="Clear" tone="success" />} />
      <LineItem label="Upload ShipStation CSV" detail="Import a local ShipStation export" right=<button type="button" onClick={() => c.shipStationFileInputRef.current?.click()} className={`ds-raw-button h-full border-l border-border-soft px-3 text-role-caption font-semibold text-text-default hover:bg-surface-sunken`}>Upload</button> />
      {c.tokenAccounts.map((account) => {
        const minutesLeft = Math.floor((new Date(account.token_expires_at).getTime() - c.now.getTime()) / 60000);
        const isRefreshing = c.refreshTokenMutation.isPending && c.refreshTokenMutation.variables === account.account_name;
        return (
          <LineItem
            key={account.id}
            label={account.account_name}
            detail={minutesLeft <= 0 ? 'Token expired' : `Token expires in ${minutesLeft} min`}
            right={<ActionButton onClick={() => c.refreshTokenMutation.mutate(account.account_name)} loading={isRefreshing} title={`Refresh ${account.account_name}`} />}
          />
        );
      })}
    </SidebarSection>
  );
}

export function ZohoSection({ c }: { c: ConnectionsPanelController }) {
  return (
    <SidebarSection title="Inventory sync" expanded={c.showZoho} onToggle={() => c.setShowZoho((v) => !v)}>
      <div className="border-b border-border-soft bg-surface-card px-4 py-3">
        <Link
          href="/apps/sync?page=zoho-management"
          className={`inline-flex border-b border-border-strong py-1 ${sectionLabel} text-text-default`}
        >
          Inventory sync tools →
        </Link>
      </div>
      {/* One home for the inventory sync actions (Impeccable dedup): the
          Zoho management sheet owns refresh/sync/import + telemetry; this
          section is the door. */}
    </SidebarSection>
  );
}

export function BackfillSection({ c }: { c: ConnectionsPanelController }) {
  return (
    <SidebarSection title="Backfill" expanded={c.showBackfill} onToggle={() => c.setShowBackfill((v) => !v)}>
      <LineItem label="Backfill eBay Orders" detail="Fill only missing order fields from eBay" right={<ActionButton onClick={() => c.ebayBackfillMutation.mutate()} loading={c.ebayBackfillMutation.isPending} title="Backfill eBay orders" label="Backfill" tone="info" />} />
      <LineItem label="Backfill Ecwid Orders" detail="Fill only missing order fields from Ecwid" right={<ActionButton onClick={() => c.ecwidBackfillMutation.mutate()} loading={c.ecwidBackfillMutation.isPending} title="Backfill Ecwid orders" label="Backfill" tone="info" />} />
    </SidebarSection>
  );
}

export function CatalogSection({ c }: { c: ConnectionsPanelController }) {
  return (
    <SidebarSection title="Catalog" expanded={c.showCatalog} onToggle={() => c.setShowCatalog((v) => !v)}>
      <LineItem label="Preview Ecwid to Square Sync" detail="See what the enabled product sync would change" right={<ActionButton onClick={() => c.ecwidSquareSyncMutation.mutate({ dryRun: true })} loading={c.ecwidSquareSyncMutation.isPending && c.ecwidSquareSyncMutation.variables?.dryRun === true} title="Preview Ecwid to Square sync" />} />
      <LineItem label="Run Ecwid to Square Sync" detail="Push enabled Ecwid products into Square" right={<ActionButton onClick={() => c.ecwidSquareSyncMutation.mutate({ dryRun: false })} loading={c.ecwidSquareSyncMutation.isPending && c.ecwidSquareSyncMutation.variables?.dryRun === false} title="Run Ecwid to Square sync" label="Run" tone="info" />} />
    </SidebarSection>
  );
}

export function ShippingSection({ c }: { c: ConnectionsPanelController }) {
  return (
    <SidebarSection title="Shipping Tracking" expanded={c.showShipping} onToggle={() => c.setShowShipping((v) => !v)}>
      {(['USPS', 'UPS', 'FEDEX'] as const).map((carrier) => {
        const isSyncing = c.carrierSyncMutation.isPending && c.carrierSyncMutation.variables === carrier;
        return (
          <LineItem
            key={carrier}
            label={carrier}
            detail="Run due tracking updates for this carrier"
            right={<ActionButton onClick={() => c.carrierSyncMutation.mutate(carrier)} loading={isSyncing} title={`Sync ${carrier}`} label="Sync" tone="info" />}
          />
        );
      })}
    </SidebarSection>
  );
}

export function AmazonSection({ c }: { c: ConnectionsPanelController }) {
  return (
    <SidebarSection title="Amazon" expanded={c.showAmazon} onToggle={() => c.setShowAmazon((v) => !v)}>
      <LineItem
        label="Connect via OAuth"
        detail="Authorize Amazon for this organization (multi-tenant)"
        right={
          <HoverTooltip label="Connect Amazon via OAuth" asChild>
            <a
              href="/api/amazon/oauth/start"
              className="ds-raw-button inline-flex h-full items-center justify-center border-l border-border-info bg-surface-info px-3 text-role-caption font-semibold text-text-info hover:bg-surface-hover"
            >
              Connect
            </a>
          </HoverTooltip>
        }
      />
      <LineItem
        label="Check Connection"
        detail="Verify stored Amazon credentials reach SP-API"
        right={<ActionButton onClick={() => c.amazonHealthMutation.mutate()} loading={c.amazonHealthMutation.isPending} title="Check Amazon connection" label="Check" tone="success" />}
      />
      <LineItem
        label="Sync Orders"
        detail="Import tracked Amazon orders (by SKU / FBA item)"
        right={<ActionButton onClick={() => c.amazonSyncMutation.mutate(false)} loading={c.amazonSyncMutation.isPending && c.amazonSyncMutation.variables === false} title="Sync Amazon orders" label="Sync" tone="info" />}
      />
      <LineItem
        label="Sync All Orders"
        detail="Import every order, including untracked SKUs"
        right={<ActionButton onClick={() => c.amazonSyncMutation.mutate(true)} loading={c.amazonSyncMutation.isPending && c.amazonSyncMutation.variables === true} title="Sync all Amazon orders" label="Sync all" tone="info" />}
      />
      <div className="border-b border-border-soft bg-surface-card px-4 py-3">
        <p className={dataValue}>Connect with refresh token</p>
        <p className={`mt-0.5 ${fieldLabel} text-text-soft`}>
          Credential connect lives in{' '}
          <a href="/apps/amazon" className="font-medium text-text-info hover:underline">
            Apps → Amazon
          </a>
          . Use this page for sync tools only.
        </p>
      </div>
      {c.amazonAccounts.map((acc) => (
        <LineItem
          key={acc.id}
          label={acc.account_name}
          detail={acc.last_error ? `Error: ${acc.last_error}` : `${acc.region} · ${acc.status}`}
          right={
            <HoverTooltip label={`Disconnect ${acc.account_name}`} asChild>
              <button
                type="button"
                onClick={() => c.amazonDisconnectMutation.mutate(acc.id)}
                disabled={c.amazonDisconnectMutation.isPending && c.amazonDisconnectMutation.variables === acc.id}
                className="ds-raw-button h-full border-l border-border-soft px-3 text-role-caption font-semibold text-text-muted hover:bg-surface-danger hover:text-text-danger disabled:opacity-50"
                aria-label={`Disconnect ${acc.account_name}`}
              >
                Disconnect
              </button>
            </HoverTooltip>
          }
        />
      ))}
    </SidebarSection>
  );
}
