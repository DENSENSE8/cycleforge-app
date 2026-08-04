'use client';

/**
 * Incoming details stack header — composes {@link DeskRailChromeRow} (SoT):
 *
 * ```text
 * [→|] ……………………………… [↑][↓][↻]
 * tabs
 * identity
 * ```
 *
 * NON-MODAL: Escape via RightRailHost; outset edge-collapse suppressed
 * (`edgeCollapse={false}`).
 */

import { Inbox, RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
  PaneHeaderTabs,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { IconButton } from '@/design-system/primitives';
import type { DetailsResponse, TabId } from './incoming-details-shared';

function statusTone(
  status: string | null | undefined,
): 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose' {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (s.includes('deliver')) return 'emerald';
  if (s.includes('transit') || s.includes('ship')) return 'blue';
  if (s.includes('cancel') || s.includes('fail') || s.includes('exception')) return 'rose';
  if (s.includes('pending') || s.includes('open') || s.includes('issued')) return 'amber';
  return 'neutral';
}

export function IncomingDetailsHeader({
  headerPo,
  headerTracking,
  headerOrder,
  vendorName,
  statusLabel,
  isShipmentOnly,
  isInboundOnly,
  syncing,
  onSync,
  tabs,
  tab,
  onTabChange,
  onClose,
  /** Selection-plane actions (Copy / Print / Ticket) when the check-set is published. */
  selectionActions = [],
}: {
  headerPo: string;
  headerTracking: string;
  headerOrder: string;
  vendorName: string | null;
  statusLabel: string | null;
  isShipmentOnly: boolean;
  isInboundOnly: boolean;
  syncing: boolean;
  onSync: () => void;
  tabs: Array<{ value: TabId; label: string }>;
  tab: TabId;
  onTabChange: (next: TabId) => void;
  onClose: () => void;
  selectionActions?: PaneHeaderActionBarAction[];
}) {
  const eyebrow = isInboundOnly
    ? 'Marketplace order'
    : isShipmentOnly
      ? 'Shipment'
      : 'Purchase order';

  const value =
    headerPo ||
    headerOrder ||
    (headerTracking ? headerTracking : '—');

  const syncTitle = isInboundOnly
    ? 'Re-pull this order from linked marketplace accounts (eBay) + re-poll its shipment'
    : 'Re-pull this PO from inventory + re-poll its shipment';
  const syncAria = isInboundOnly ? 'Resync this marketplace order' : 'Sync this PO';

  const navigate = (direction: 'prev' | 'next') => {
    window.dispatchEvent(new CustomEvent('receiving-navigate-table', { detail: direction }));
  };

  return (
    <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
      <DeskRailChromeRow
        onClose={onClose}
        onPrev={() => navigate('prev')}
        onNext={() => navigate('next')}
        prevTestId="incoming-details-prev"
        nextTestId="incoming-details-next"
        trailing={
          selectionActions.length > 0 || !isShipmentOnly ? (
            <>
              {selectionActions.map((action) => {
                const label =
                  action.title ??
                  (typeof action.label === 'string' ? action.label : action.key);
                return (
                  <HoverTooltip key={action.key} label={label} asChild>
                    <IconButton
                      size="xs"
                      tone="neutral"
                      disabled={action.disabled}
                      ariaLabel={label}
                      onClick={action.onClick}
                      icon={action.icon}
                    />
                  </HoverTooltip>
                );
              })}
              {isShipmentOnly ? null : (
                <HoverTooltip label={syncTitle} asChild>
                  <IconButton
                    size="xs"
                    tone="neutral"
                    disabled={syncing}
                    ariaLabel={syncAria}
                    onClick={onSync}
                    data-testid="incoming-details-sync"
                    className="text-emerald-700"
                    icon={
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    }
                  />
                </HoverTooltip>
              )}
            </>
          ) : undefined
        }
      />

      <PaneHeaderTabs
        dense
        tabs={tabs}
        value={tab}
        onChange={onTabChange}
        className="px-2"
      />
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <PaneHeaderIconBadge Icon={Inbox} bg="bg-emerald-100" tint="text-emerald-700" />
        <div className="flex min-w-0 flex-col gap-1">
          <PaneHeaderLabel
            eyebrow={eyebrow}
            value={value}
            valueTitle={value}
          />
          {(statusLabel || vendorName) ? (
            <div className="flex flex-wrap items-center gap-2">
              {statusLabel ? (
                <PaneHeaderStatusPill tone={statusTone(statusLabel)} pulse={false}>
                  {statusLabel}
                </PaneHeaderStatusPill>
              ) : null}
              {vendorName ? (
                <span className="truncate text-role-caption font-semibold text-text-soft">
                  {vendorName}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Derive status + vendor strings once data lands. */
export function incomingDetailsHeaderMeta(data: DetailsResponse | undefined): {
  statusLabel: string | null;
  vendorName: string | null;
} {
  if (!data) return { statusLabel: null, vendorName: null };
  const statusLabel =
    data.po?.status?.trim() ||
    data.shipment?.latest_status_category?.trim() ||
    null;
  const vendorName =
    data.po?.vendor_name?.trim() ||
    data.inbound?.seller_name?.trim() ||
    null;
  return { statusLabel, vendorName };
}

/**
 * RightRailHost occupant id for the Incoming inspector — STABLE, deliberately
 * NOT keyed on the row.
 *
 * The host keys its `AnimatePresence mode="wait"` on the occupant id, so the
 * old per-record ids (`detail:incoming:<poId>` / `:shipment:<id>` /
 * `:inbound:<type>:<id>`) made every row→row step a full exit-then-enter with
 * an empty slot in between. Walking the Incoming grid row by row is the core
 * loop on that surface. One stable id keeps the aside mounted and swaps its
 * node in place (the store's `updateRightRailPanelNode` path) — the same
 * queue-processing exception `detail:order` takes (`display/motion-crossfade.md`).
 *
 * Safe because the panel re-seeds on row change: `useIncomingDetails` re-keys
 * its query on the row identity and resets the open tab to that row's default.
 */
export const INCOMING_DETAILS_RAIL_ID = 'detail:incoming';

/** Accessible name for the non-modal aside — the row's own identity. */
export function incomingDetailsAriaLabel(identity: string): string {
  const trimmed = identity.trim();
  return trimmed ? `Incoming ${trimmed} details` : 'Incoming details';
}
