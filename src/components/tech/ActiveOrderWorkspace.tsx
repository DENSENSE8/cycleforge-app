'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, History, MapPin, Package, Tags } from '@/components/Icons';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import {
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
  WorkspaceTimelineTab,
  buildSectionTabs,
} from '@/components/station/workbench';
import { STATION_SCAN_WELL_CLASS } from '@/components/station/scan-depth';
import {
  StationDisplaysParkedRail,
  StationDisplaysUtilityRail,
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  resolveDisplaysActiveTab,
  useYieldStationDisplaysOnAssistantOpen,
  type DisplayIndexRow,
} from '@/components/station/displays';
import { StationConditionEditor } from '@/components/tech/StationConditionEditor';
import { ListingLinksTab } from '@/components/receiving/workspace/line-edit/ListingLinksTab';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { Order } from '@/components/station/upnext/upnext-types';
import { UpNextActionDock } from './UpNextActionDock';
import { ShippingScanWorkspace } from './shipping/ShippingScanWorkspace';
import { ShippingCapturedUnits } from './shipping/ShippingCapturedUnits';
import {
  ShippingEntityContextHeader,
} from './shipping/ShippingEntityContextHeader';
import { PackLocationsLeaf } from './shipping/PackLocationsLeaf';
import { usePackOrderPlacement } from './shipping/usePackOrderPlacement';
import { resolveShippingListingLinks } from './shipping/shipping-listing-links';
import { TechSubstituteSection } from './TechSubstituteSection';
import { useSubstitutionPolicy } from '@/hooks/fulfillment/useSubstitutionPolicy';
import { useOrderAmendments } from '@/hooks/fulfillment/useSubstitution';
import { canShowTechSubstitution } from '@/lib/tech/substitution-eligibility';
import { useOrderAssignment } from '@/hooks';

/** Units · Condition · Timeline · Listings (trailing — upgrade slot) · Locations. */
type ShippingDisplayTab =
  | 'units'
  | 'condition'
  | 'timeline'
  | 'listings'
  | 'locations';

/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
type ShippingDisplayNav = typeof STATION_DISPLAY_INDEX | ShippingDisplayTab;

interface ActiveOrderWorkspaceProps {
  activeOrder: ActiveStationOrder;
  onClose: () => void;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
  /**
   * `active` — order has been scanned and is in progress (default).
   * `preview` — user clicked an Up Next card to inspect it; nothing has been
   *  scanned yet. Header changes to "Preview" and the notes composer mounts at
   *  the waist with Start / Out of Stock on its trailing edge (they no longer
   *  live on the sidebar card, and never as a floating bottom CTA).
   */
  mode?: 'active' | 'preview';
  /**
   * Original `Order` row backing the preview. Required in preview mode so
   * `UpNextActionDock` can dispatch action events with the right ids
   * (`ActiveStationOrder` doesn't carry the numeric row id).
   */
  previewOrder?: Order;
  /** Optionally pass the setActiveOrder updater from the controller to sync local condition. */
  setActiveOrder?: (next: ActiveStationOrder | null) => void;
}

/**
 * Focused work-item view rendered in the `/test` right pane while an order is
 * active. Unbox-family host: StationScanPaneHost + StationPanelRoot.
 *
 * **The centre is serial pairing and nothing else.** Units · Condition ·
 * Timeline · Listings · Locations clarify on Displays; the order's identity is
 * `StationContextBar` + `ShippingEntityContextHeader`; the packing desk is the
 * floor's location pill. Two things were deliberately taken OUT of the middle:
 * the wrap of packing-desk chips (a destination picker standing where the work
 * goes — the desks now live in the pill's menu) and the active-order scan dump
 * (a second identity block under the identity row). Neither may come back: the
 * centre of a scan station is the job in hand.
 */
export function ActiveOrderWorkspace({
  activeOrder,
  onClose,
  onRemoveSerial,
  mode = 'active',
  previewOrder,
  setActiveOrder,
}: ActiveOrderWorkspaceProps) {
  const isPreview = mode === 'preview';

  const [activeSideTab, setActiveSideTab] = useState<ShippingDisplayNav | null>(null);

  const listingResolution = useMemo(
    () => resolveShippingListingLinks(activeOrder),
    [activeOrder.itemNumber, activeOrder.sku],
  );
  const [listingLink, setListingLink] = useState(listingResolution.listingUrl ?? '');
  useEffect(() => {
    setListingLink(listingResolution.listingUrl ?? '');
  }, [
    activeOrder.orderId,
    activeOrder.tracking,
    listingResolution.listingItemKey,
    listingResolution.listingUrl,
  ]);

  const policyQuery = useSubstitutionPolicy();
  const substitution = useMemo(
    () =>
      canShowTechSubstitution({
        policy: policyQuery.data,
        activeOrder,
        mode,
        previewOrderId: previewOrder?.id ?? null,
      }),
    [policyQuery.data, activeOrder, mode, previewOrder?.id],
  );
  const blockEnforced =
    substitution.show && policyQuery.data?.enforcement === 'block_until_approved';
  const amendments = useOrderAmendments(blockEnforced ? substitution.orderId : null);
  const pendingCount = blockEnforced
    ? (amendments.data ?? []).filter((r) => r.status === 'PENDING').length
    : 0;

  const packOrderId =
    !isPreview && activeOrder.id != null && activeOrder.orderFound !== false
      ? Number(activeOrder.id)
      : null;
  const placement = usePackOrderPlacement({
    orderId: packOrderId,
    initialLocationId: activeOrder.packLocationId,
    initialLocationName: activeOrder.packLocationName,
  });

  const orderAssignmentMutation = useOrderAssignment();
  const isShipped =
    previewOrder?.status === 'SHIPPED' || previewOrder?.status === 'SHIPPED_EXT';

  const handleConditionChange = useCallback(
    async (nextCondition: string) => {
      const rowId = isPreview ? previewOrder?.id : activeOrder.id;
      if (!rowId) return;

      await orderAssignmentMutation.mutateAsync({
        orderId: rowId,
        condition: nextCondition,
      });

      if (setActiveOrder && !isPreview) {
        setActiveOrder({ ...activeOrder, condition: nextCondition });
      }
    },
    [
      isPreview,
      previewOrder?.id,
      activeOrder,
      orderAssignmentMutation,
      setActiveOrder,
    ],
  );

  const tracking =
    String(activeOrder.tracking ?? '').trim() ||
    String(previewOrder?.shipping_tracking_number ?? '').trim();
  const orderId = String(activeOrder.orderId ?? '').trim();
  const hasTimelineDisplay =
    tracking.length > 0 || orderId.length > 0 || activeOrder.serialNumbers.length > 0;

  const conditionLabel = String(activeOrder.condition || '').trim() || 'Not set';

  /** Enriched rows keep Listings in Context (trailing) — default group would
   *  hoist `listings` into Verification and jump it above Condition. */
  const displayIndexRows = useMemo<DisplayIndexRow[]>(() => {
    const serialCount = activeOrder.serialNumbers.length;
    const rows: DisplayIndexRow[] = [
      {
        id: 'units',
        label: 'Units',
        subtitle: serialCount > 0 ? `${serialCount} captured` : 'No serials yet',
        tone: serialCount > 0 ? 'ok' : 'action',
        group: 'verification',
      },
      {
        id: 'condition',
        label: 'Condition',
        subtitle: conditionLabel,
        tone: String(activeOrder.condition || '').trim() ? 'ok' : 'action',
        group: 'verification',
      },
    ];
    if (hasTimelineDisplay) {
      rows.push({
        id: 'timeline',
        label: 'Timeline',
        subtitle: 'Order history',
        tone: 'neutral',
        group: 'context',
      });
    }
    rows.push({
      id: 'listings',
      label: 'Listings',
      subtitle: listingResolution.listingUrl ? 'Listing links' : 'No listing',
      tone: listingResolution.listingUrl ? 'ok' : 'neutral',
      group: 'context',
    });
    if (packOrderId != null) {
      rows.push({
        id: 'locations',
        label: 'Locations',
        // A directory, never an alarm — an unplaced order is normal mid-pack.
        subtitle: placement.locationName || 'Place · print · mint',
        tone: placement.locationName ? 'ok' : 'neutral',
        group: 'context',
      });
    }
    return rows;
  }, [
    activeOrder.condition,
    activeOrder.serialNumbers.length,
    conditionLabel,
    hasTimelineDisplay,
    listingResolution.listingUrl,
    packOrderId,
    placement.locationName,
  ]);

  // Declared above `displayTabs` on purpose: the Locations leaf inside that memo
  // calls it, and the memo factory runs at ITS line during render — a `const`
  // below would be in the temporal dead zone when the factory reads it.
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'units',
          label: 'Units',
          icon: Package,
          content: (
            <ShippingCapturedUnits
              activeOrder={activeOrder}
              onRemoveSerial={isPreview ? undefined : onRemoveSerial}
            />
          ),
        },
        {
          id: 'condition',
          label: 'Condition',
          icon: Tags,
          content: (
            <div className={cn('py-3', DISPLAYS_BODY_INSET)}>
              <StationConditionEditor
                condition={activeOrder.condition}
                onChange={(next) => void handleConditionChange(next)}
                isLocked={Boolean(isShipped) || orderAssignmentMutation.isPending || isPreview}
                collapsible={false}
              />
            </div>
          ),
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimelineDisplay,
          content: (
            <WorkspaceTimelineTab
              orderId={orderId || null}
              tracking={tracking || null}
              serials={activeOrder.serialNumbers}
            />
          ),
        },
        {
          id: 'locations',
          label: 'Locations',
          icon: MapPin,
          visible: packOrderId != null,
          // Placing the order on a bench is a completed errand — hand the
          // operator back to the work instead of leaving the column parked
          // open, the same close-on-placed contract Arrival's leaf uses.
          content: (
            <PackLocationsLeaf placement={placement} onPlaced={closeDisplays} />
          ),
        },
        {
          id: 'listings',
          label: 'Listings',
          icon: ExternalLink,
          // Trailing upgrade slot — always on the index so Ready-to-Pack can
          // grow listing tools without reshuffling Condition · Timeline.
          content: (
            <ListingLinksTab
              listingLinks={listingResolution.listingLinks}
              listingLink={listingLink}
              setListingLink={setListingLink}
            />
          ),
        },
      ]),
    [
      activeOrder,
      onRemoveSerial,
      activeOrder.condition,
      activeOrder.serialNumbers,
      handleConditionChange,
      hasTimelineDisplay,
      orderId,
      tracking,
      isShipped,
      isPreview,
      orderAssignmentMutation.isPending,
      listingResolution.listingLinks,
      listingLink,
      packOrderId,
      placement,
      closeDisplays,
    ],
  );

  /** `←|` Open displays → the Root Index, not `displayTabs[0]`. */
  const openDisplaysIndex = useCallback(() => setActiveSideTab(STATION_DISPLAY_INDEX), []);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);

  const resolvedSideTab = useMemo(
    () =>
      resolveDisplaysActiveTab(
        activeSideTab,
        displayTabs.map((t) => t.id),
      ),
    [activeSideTab, displayTabs],
  );

  const utilityRailBody = !resolvedSideTab ? (
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={displayTabs}
          activeId={activeSideTab ?? null}
          onOpenLeaf={(id) =>
            setActiveSideTab(id as Parameters<typeof setActiveSideTab>[0])
          }
        />
      }
    />
  ) : null;

  // Host (`TechRightPane`) owns scan-cadence swap; this panel is opaque content.
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-shipping-pane-host': true }}
        centerTestId="shipping-station-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot className="flex-1">
            <StationContextBar
              placement="flow"
              identity={
                <ShippingEntityContextHeader
                  activeOrder={activeOrder}
                  onExitToList={onClose}
                />
              }
              moreDetails={
                Boolean(previewOrder?.is_out_of_stock) || pendingCount > 0 ? (
                  <StationMoreDetails>
                    {Boolean(previewOrder?.is_out_of_stock) ? (
                      <HoverTooltip label="Out of stock" asChild>
                        <span
                          className="inline-flex items-center gap-1 rounded-none bg-red-50 px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest text-red-800 ring-1 ring-inset ring-red-200"
                          data-testid="shipping-oos-corner"
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          OOS
                        </span>
                      </HoverTooltip>
                    ) : null}
                    {pendingCount > 0 ? (
                      <HoverTooltip
                        label={
                          pendingCount === 1
                            ? 'A substitution awaits supervisor approval'
                            : `${pendingCount} substitutions await supervisor approval`
                        }
                        asChild
                      >
                        <span
                          className="inline-flex items-center gap-1 rounded-none bg-amber-50 px-1.5 py-0.5 text-role-micro font-semibold uppercase tracking-widest text-amber-800 ring-1 ring-inset ring-amber-200"
                          data-testid="shipping-sub-pending-corner"
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Sub {pendingCount}
                        </span>
                      </HoverTooltip>
                    ) : null}
                  </StationMoreDetails>
                ) : undefined
              }
            />
            <StationWorkbench
              ambientWash={false}
              className="relative z-0 flex-1 bg-transparent"
              reserveScrollClearance={isPreview && Boolean(previewOrder)}
              reserveIdentityClearance={false}
              bodyGap="none"
              // No footer band. The pack-desk picker left the centre 2026-08-20:
              // choosing a bench is a DESTINATION, and a destination sitting in
              // the work surface stops the operator's eye before they have done
              // the job. Desks now live only in Displays → Locations
              // (`PackLocationsLeaf`), the same place every other station's
              // placement lives.
              // Advisories (OOS · sub pending) live in StationMoreDetails — never
              // a centre entityContext strip (Unbox centre = ops-flow only).
              tabs={
                <div className={STATION_SCAN_WELL_CLASS}>
                  <ShippingScanWorkspace
                    activeOrder={activeOrder}
                    previewOrder={isPreview ? previewOrder : undefined}
                  />
                </div>
              }
              // Notes composer + embedded Start pill (Unbox/Testing waist
              // shape). Not a floating terminal dock — that green capsule was
              // the old page chrome.
              dock={isPreview && previewOrder ? <UpNextActionDock order={previewOrder} /> : null}
            >
              {substitution.show && substitution.orderId !== null ? (
                <TechSubstituteSection
                  orderId={substitution.orderId}
                  orderLabel={substitution.orderLabel}
                  enforcement={policyQuery.data?.enforcement ?? 'advisory'}
                />
              ) : null}
            </StationWorkbench>
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <StationDisplaysPushStack
              ariaLabel="Ready to Pack displays"
              storageKey="shipping-displays-push-width"
              testId="shipping-displays-push"
              resizeTestId="shipping-displays-push-resize"
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={(id) => setActiveSideTab(id as ShippingDisplayNav)}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
    </div>
  );
}
