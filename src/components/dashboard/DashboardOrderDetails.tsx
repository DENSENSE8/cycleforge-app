'use client';

/**
 * To-ship / shipped-archive order record plane.
 *
 * Two placements:
 * - `placement="stage"` (default — Shipped archive): Center Lock L2, a
 *   {@link DeskStageOverlay} `fill="stage"` over the queue (table stays
 *   mounted). Walk chrome (k of n, prev/next) reads the published record cursor.
 * - `placement="rail"` (To ship): the SAME panel registers as the right rail's
 *   `detail:order` occupant (triage mode), beside the industrial ledger instead
 *   of on top of it — the floor keeps its rows in view while it reads one order
 *   (BRIEF §6: page mode + right-rail mode). j / k still walk the cursor.
 *
 * Body topics stay in {@link ShippedDetailsPanel} / {@link UnshippedDetailsPanel}.
 */

import dynamic from 'next/dynamic';
import type { ShippedOrder } from '@/types/orders';
import type { ShippedDetailsContext } from '@/utils/events';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';

// Phase 4 (bundle deferral): the detail panels load on FIRST open (a row click),
// not in the initial dashboard bundle. `ssr: false` — they're client-only
// slide-overs already gated behind a selection, so a null-while-loading is invisible.
const ShippedDetailsPanel = dynamic(
  () => import('@/components/shipped').then((m) => m.ShippedDetailsPanel),
  { ssr: false },
);
const UnshippedDetailsPanel = dynamic(
  () => import('@/components/unshipped/UnshippedDetailsPanel').then((m) => m.UnshippedDetailsPanel),
  { ssr: false },
);

interface DashboardOrderDetailsProps {
  detailsEnabled: boolean;
  selectedShipped: ShippedOrder | null;
  selectedContext: ShippedDetailsContext;
  onClose: () => void;
  onUpdate: () => void;
  /** Where the record opens — see the module doc. */
  placement?: 'stage' | 'rail';
}

export function DashboardOrderDetails({
  detailsEnabled,
  selectedShipped,
  selectedContext,
  onClose,
  onUpdate,
  placement = 'stage',
}: DashboardOrderDetailsProps) {
  const cursor = useRecordCursor('record');
  const open = detailsEnabled && Boolean(selectedShipped);
  const meta = selectedShipped ? deriveShippedHeaderMeta(selectedShipped) : null;
  const handleClose = cursor.onClose ?? onClose;

  const indexLabel =
    cursor.available && cursor.position != null
      ? `${cursor.position} of ${cursor.total}`
      : undefined;

  if (placement === 'rail') {
    if (!open || !selectedShipped) return null;
    return selectedContext === 'queue' ? (
      <UnshippedDetailsPanel
        key={selectedShipped.id}
        shipped={selectedShipped}
        onClose={handleClose}
        onUpdate={onUpdate}
        surface="rail"
      />
    ) : (
      <ShippedDetailsPanel
        key={selectedShipped.id}
        shipped={selectedShipped}
        context={
          selectedContext === 'shipped'
            ? 'shipped'
            : selectedContext === 'packed'
              ? 'packed'
              : 'dashboard'
        }
        onClose={handleClose}
        onUpdate={onUpdate}
        surface="rail"
      />
    );
  }

  return (
    <DeskStageOverlay
      open={open}
      onClose={handleClose}
      title={meta ? `Order ${meta.orderIdDisplay} details` : 'Order details'}
      subtitle={selectedShipped?.product_title?.trim() || undefined}
      indexLabel={indexLabel}
      onPrev={cursor.onPrev ?? undefined}
      onNext={cursor.onNext ?? undefined}
      prevDisabled={cursor.prevDisabled}
      nextDisabled={cursor.nextDisabled}
      fill="stage"
      closeOnScrim={false}
      testId="desk-order-stage-overlay"
    >
      {selectedShipped ? (
        selectedContext === 'queue' ? (
          <UnshippedDetailsPanel
            key={selectedShipped.id}
            shipped={selectedShipped}
            onClose={handleClose}
            onUpdate={onUpdate}
            surface="stage"
          />
        ) : (
          <ShippedDetailsPanel
            key={selectedShipped.id}
            shipped={selectedShipped}
            context={
              selectedContext === 'shipped'
                ? 'shipped'
                : selectedContext === 'packed'
                  ? 'packed'
                  : 'dashboard'
            }
            onClose={handleClose}
            onUpdate={onUpdate}
            surface="stage"
          />
        )
      ) : null}
    </DeskStageOverlay>
  );
}
