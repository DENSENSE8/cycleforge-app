'use client';

import { useMemo } from 'react';
import { motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { AlertTriangle } from '@/components/Icons';
import { StationContextBar } from '@/components/station/entity-context';
import { StationPanelRoot, StationWorkbench } from '@/components/station/workbench';
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
 * active. Crossfades in over the shipping workbench (see TechRightPane) — this
 * is the master-detail "detail" surface for the shipping station.
 *
 * Station Workbench host (`.claude/rules/display/station-workbench.md`): the
 * sticky {@link StationContextBar} identity bookmark hangs under GlobalHeader
 * with the same canvas gutter as the context-panel card (`top-2`), above
 * {@link StationWorkbench}, which owns the scroll body
 * (notices → section tabs → siblings) and the terminal dock band. There is no
 * second `PaneHeader` title row — the identity bookmark IS the header, and its
 * back chevron returns to the list.
 *
 * The scan bar lives in the sidebar and stays focused; this surface should not
 * steal focus. Closing returns the pane to the history view.
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
  // Station crossfade — route the active-card preset through the reduced-motion
  // bridge so `prefers-reduced-motion` collapses the y-slide to a pure opacity
  // crossfade automatically (motion-crossfade.md: don't consume framerPresence.*
  // raw on a user-facing surface). The parent `TechRightPane` owns the
  // `AnimatePresence mode="wait"` + stable per-entity key.
  const cardPresence = useMotionPresence(framerPresence.stationCard);
  const cardTransition = useMotionTransition(framerTransition.stationCardMount);

  // Fulfillment substitution (docs/todo/tech-substitution-wiring-plan.md §5
  // Phase 1.3): org policy + pure eligibility gate. Hidden for FBA / repair /
  // exception sessions, not-found orders, and whenever policy.canSubstitute is
  // false (flag off, 'test' node not allowed, or missing permission).
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
  // Pending-amendment banner (§5 Phase 2.3): under block_until_approved the
  // order cannot pack/ship while a substitution is PENDING — surface that at
  // the top of the workspace body. The amendments query is shared with
  // SubstituteUnitCard (same key), so this costs no extra fetch while shown.
  const blockEnforced =
    substitution.show && policyQuery.data?.enforcement === 'block_until_approved';
  const amendments = useOrderAmendments(blockEnforced ? substitution.orderId : null);
  const pendingCount = blockEnforced
    ? (amendments.data ?? []).filter((r) => r.status === 'PENDING').length
    : 0;

  const orderAssignmentMutation = useOrderAssignment();
  const handleConditionChange = async (nextCondition: string) => {
    const orderId = isPreview ? previewOrder?.id : activeOrder.id;
    if (!orderId) return;

    await orderAssignmentMutation.mutateAsync({
      orderId,
      condition: nextCondition,
    });

    if (setActiveOrder && !isPreview) {
      setActiveOrder({ ...activeOrder, condition: nextCondition });
    }
  };

  return (
    <motion.div
      key={activeOrder.tracking || activeOrder.orderId}
      initial={cardPresence.initial}
      animate={cardPresence.animate}
      exit={cardPresence.exit}
      transition={cardTransition}
      className="flex h-full min-h-0 w-full flex-col"
    >
      <StationPanelRoot className="flex-1">
        <StationContextBar
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
          // Preview mounts the floating Start dock (docked=false → absolute
          // bottom slice), so the scroll column reserves its clearance.
          reserveScrollClearance={isPreview && Boolean(previewOrder)}
          entityContext={
            <>
              <ShippingOutOfStockNotice
                isOutOfStock={Boolean(previewOrder?.is_out_of_stock)}
              />
              {pendingCount > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <div className="space-y-0.5">
                    <p className="text-role-caption font-semibold text-amber-800">
                      Substitution pending approval
                    </p>
                    <p className="text-role-micro font-semibold text-amber-700">
                      {pendingCount === 1 ? 'A substitution on this order is' : `${pendingCount} substitutions on this order are`}{' '}
                      awaiting supervisor approval — the order cannot pack or ship until approved.
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
              onChangeCondition={handleConditionChange}
              isMutatingCondition={orderAssignmentMutation.isPending}
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
    </motion.div>
  );
}
