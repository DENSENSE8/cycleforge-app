'use client';

/**
 * Incoming workbench Sync menu — one icon-only {@link ToolbarButton} that opens
 * a uniform menu of sync / import actions (replacing the multicolored sidebar
 * button stack). Heavy Sync Orders flow expands in {@link RightPaneOverlay}
 * (same shell as {@link ReceivingClaimModal} / {@link OrderSyncDialog}).
 */

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  RefreshCw,
  Package,
  Truck,
  Mail,
  Link2,
  Database,
  Loader2,
} from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
} from '@/components/dashboard/workbench-filter-popover';
import { cn } from '@/utils/_cn';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { useQueryClient } from '@tanstack/react-query';
import { useIncomingSyncActions } from './useIncomingSyncActions';
import { CarrierSyncDialog } from '@/components/sidebar/receiving/CarrierSyncDialog';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';
import { IncomingAttachTrackingPopover } from '@/components/sidebar/receiving/IncomingAttachTrackingPopover';
import { IncomingOrdersSyncOverlay } from './IncomingOrdersSyncOverlay';

export function IncomingSyncMenu() {
  const queryClient = useQueryClient();
  const sync = useIncomingSyncActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const busy = useMemo(
    () =>
      sync.refreshing ||
      sync.zohoRefreshing ||
      sync.rescanning ||
      sync.marketplaceRefreshing,
    [sync.refreshing, sync.zohoRefreshing, sync.rescanning, sync.marketplaceRefreshing],
  );

  const closeThen = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <>
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <ToolbarButton
            iconOnly
            active={menuOpen || busy}
            aria-expanded={menuOpen}
            aria-label="Sync Incoming"
          >
            <HoverTooltip label="Sync Incoming" focusable={false}>
              <span className="relative inline-flex">
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {busy ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 ring-1 ring-surface-card"
                    aria-hidden
                  />
                ) : null}
              </span>
            </HoverTooltip>
          </ToolbarButton>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            className={cn(
              'z-dropdown w-56 overflow-hidden rounded-lg border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none',
            )}
          >
            <WorkbenchFilterGroupLabel>Orders</WorkbenchFilterGroupLabel>
            <WorkbenchFilterMenuRow
              label="Sync Orders"
              active={false}
              leading={<Database className="h-3.5 w-3.5 shrink-0" />}
              onClick={() => closeThen(() => setOrdersOpen(true))}
            />

            <WorkbenchFilterDivider />

            <WorkbenchFilterGroupLabel>Incoming</WorkbenchFilterGroupLabel>
            <WorkbenchFilterMenuRow
              label={sync.marketplaceRefreshing ? 'Marketplace…' : 'Marketplace'}
              active={sync.marketplaceRefreshing}
              leading={<Package className="h-3.5 w-3.5 shrink-0" />}
              onClick={() =>
                closeThen(() => {
                  void sync.refreshMarketplace();
                })
              }
            />
            <WorkbenchFilterMenuRow
              label={sync.zohoRefreshing ? 'Inventory…' : 'Inventory'}
              active={sync.zohoRefreshing}
              leading={<RefreshCw className={`h-3.5 w-3.5 shrink-0 ${sync.zohoRefreshing ? 'animate-spin' : ''}`} />}
              onClick={() =>
                closeThen(() => {
                  void sync.refreshZoho();
                })
              }
            />
            <WorkbenchFilterMenuRow
              label={sync.refreshing ? 'Tracking…' : 'Tracking'}
              active={sync.refreshing}
              leading={<Truck className="h-3.5 w-3.5 shrink-0" />}
              onClick={() =>
                closeThen(() => {
                  void sync.refreshTracking();
                })
              }
            />
            <WorkbenchFilterMenuRow
              label={sync.rescanning ? 'Email…' : 'Email'}
              active={sync.rescanning}
              leading={<Mail className="h-3.5 w-3.5 shrink-0" />}
              onClick={() =>
                closeThen(() => {
                  void sync.rescanEmail();
                })
              }
            />

            <WorkbenchFilterDivider />

            <WorkbenchFilterMenuRow
              label="Link tracking to PO"
              active={false}
              leading={<Link2 className="h-3.5 w-3.5 shrink-0" />}
              onClick={() => closeThen(() => setAttachOpen(true))}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <IncomingOrdersSyncOverlay
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        onRefresh={() => {
          invalidateReceivingFeeds(queryClient);
          window.dispatchEvent(new CustomEvent('dashboard-refresh'));
          window.dispatchEvent(new CustomEvent('app-refresh-data'));
        }}
      />

      <IncomingAttachTrackingPopover
        open={attachOpen}
        onOpenChange={setAttachOpen}
        trigger={null}
      />

      <CarrierSyncDialog
        open={sync.syncDialogOpen}
        onClose={() => sync.setSyncDialogOpen(false)}
        isRunning={sync.isSyncing}
        elapsedMs={sync.syncElapsedMs}
        onCancel={sync.handleCancelSync}
        carriers={sync.carrierTabs}
        result={sync.syncResult}
      />
      <IncomingSyncDialog
        open={sync.incSyncOpen}
        kind={sync.incSyncKind}
        isRunning={sync.incSyncRunning}
        elapsedMs={sync.incSyncElapsedMs}
        result={sync.incSyncResult}
        onClose={() => sync.setIncSyncOpen(false)}
      />
    </>
  );
}
