'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { AlertTriangle, History, Tags } from '@/components/Icons';
import { ActiveOrderScanFeedback } from '@/components/station/ActiveOrderScanFeedback';
import { StationContextBar } from '@/components/station/entity-context';
import {
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
  WorkspaceTimelineTab,
  buildSectionTabs,
} from '@/components/station/workbench';
import { ReceivingDisplaysPushStack } from '@/components/receiving/workspace/ReceivingDisplaysPushStack';
import { UnboxDisplaysEdgeToggle } from '@/components/receiving/workspace/UnboxDisplaysEdgeToggle';
import { StationConditionEditor } from '@/components/tech/StationConditionEditor';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { Order } from '@/components/station/upnext/upnext-types';
import { UpNextActionDock } from './UpNextActionDock';
import { ShippingScanWorkspace } from './shipping/ShippingScanWorkspace';
import {
  ShippingEntityContextHeader,
  ShippingOutOfStockNotice,
} from './shipping/ShippingEntityContextHeader';
import { TechSubstituteSection } from './TechSubstituteSection';
import { useSubstitutionPolicy } from '@/hooks/fulfillment/useSubstitutionPolicy';
import { useOrderAmendments } from '@/hooks/fulfillment/useSubstitution';
import { canShowTechSubstitution } from '@/lib/tech/substitution-eligibility';
import { useOrderAssignment } from '@/hooks';

type ShippingDisplayTab = 'condition' | 'timeline';

interface ActiveOrderWorkspaceProps {
  activeOrder: ActiveStationOrder;
  onClose: () => void;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
  /**
   * `active` — order has been scanned and is in progress (default).
   * `preview` — user clicked an Up Next card to inspect it; nothing has been
   *  scanned yet. Header changes to "Preview" and the action dock mounts at
   *  the bottom so Start / Out of Stock are reachable here (they no longer
   *  live on the sidebar card).
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
 * active. Unbox-family host: StationScanPaneHost + StationPanelRoot; Ship · Units
 * stay centre work; Condition · Timeline clarify on Displays (Open displays CTA).
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
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);

  const [activeSideTab, setActiveSideTab] = useState<ShippingDisplayTab | null>(null);

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

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
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
      ]),
    [
      activeOrder.condition,
      activeOrder.serialNumbers,
      handleConditionChange,
      hasTimelineDisplay,
      orderId,
      tracking,
      isShipped,
      isPreview,
      orderAssignmentMutation.isPending,
    ],
  );

  const openDisplays = useCallback(() => {
    const first = displayTabs[0]?.id as ShippingDisplayTab | undefined;
    setActiveSideTab(first ?? 'condition');
  }, [displayTabs]);
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);

  const resolvedSideTab: ShippingDisplayTab | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    return (displayTabs[0]?.id as ShippingDisplayTab | undefined) ?? null;
  }, [activeSideTab, displayTabs]);

  const utilityRailBody = !resolvedSideTab ? (
    <div className="flex flex-col items-center gap-0 pt-0">
      <UnboxDisplaysEdgeToggle variant="pane-open" onClick={openDisplays} />
    </div>
  ) : null;

  return (
    <motion.div
      key={activeOrder.tracking || activeOrder.orderId}
      initial={cardPresence.initial}
      animate={cardPresence.animate}
      exit={cardPresence.exit}
      transition={cardTransition}
      className="flex h-full min-h-0 w-full flex-col"
    >
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
            />
            <StationWorkbench
              ambientWash={false}
              className="relative z-0 flex-1 bg-transparent"
              reserveScrollClearance={isPreview && Boolean(previewOrder)}
              reserveIdentityClearance={false}
              bodyGap="none"
              entityContext={
                <>
                  {isPreview ? null : (
                    <ActiveOrderScanFeedback activeOrder={activeOrder} />
                  )}
                  <ShippingOutOfStockNotice
                    isOutOfStock={Boolean(previewOrder?.is_out_of_stock)}
                  />
                  {pendingCount > 0 ? (
                    <div className="flex items-start gap-2 rounded-none border border-amber-200 bg-amber-50 px-4 py-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                      <div className="space-y-0.5">
                        <p className="text-role-caption font-semibold text-amber-800">
                          Substitution pending approval
                        </p>
                        <p className="text-role-micro font-semibold text-amber-700">
                          {pendingCount === 1
                            ? 'A substitution on this order is'
                            : `${pendingCount} substitutions on this order are`}{' '}
                          awaiting supervisor approval — the order cannot pack or ship until
                          approved.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              }
              tabs={
                <ShippingScanWorkspace
                  activeOrder={activeOrder}
                  previewOrder={isPreview ? previewOrder : undefined}
                  onRemoveSerial={isPreview ? undefined : onRemoveSerial}
                />
              }
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
            <ReceivingDisplaysPushStack
              ariaLabel="Shipping displays"
              storageKey="shipping-displays-push-width"
              testId="shipping-displays-push"
              resizeTestId="shipping-displays-push-resize"
              tabs={displayTabs}
              activeTab={resolvedSideTab}
              onTabChange={(id) => setActiveSideTab(id as ShippingDisplayTab)}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
    </motion.div>
  );
}
