'use client';

import { useCallback, useState } from 'react';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { slicedActionDockWrapperClass } from '@/design-system/primitives/SlicedActionDock';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench';
import { useAppendOrderNote } from '@/hooks/useOrderNotes';
import {
  dispatchUpNextActionStart,
  dispatchUpNextActionOos,
} from '@/utils/events';
import type { Order } from '@/components/station/upnext/upnext-types';
import { isOutOfStock as orderIsOutOfStock } from '@/utils/order-out-of-stock';
import { resolveShippingTerminal } from './shipping/terminal/shipping-terminal';

interface UpNextActionDockProps {
  /**
   * The Order currently previewed in the workspace. The dock dispatches
   * action events that carry this row's ids; `UpNextOrder` listens and
   * routes to its existing handlers so side-effects (parent `onStart` →
   * scan resolver kick-off, `triggerGlobalRefresh` on OOS) match a
   * sidebar-originated action.
   */
  order: Order;
}

/**
 * Ready-to-Pack preview waist — the Unbox/Triage/Testing shape: ONE raised
 * {@link OmnichannelComposerDock} for the order note, with Start (+ the Out of
 * Stock split menu) mounted as the embedded pill on its trailing edge.
 *
 * It used to be a bare bottom-of-page `StationTerminalDock` float. That green
 * capsule was the old page chrome — the verb now rides the composer, the same
 * slot Unbox's Receive and Triage's "Save for unbox" occupy.
 *
 * Enter commits the NOTE (the composer's own primary); Start is the pill click.
 * Two different consequences never share one key here — starting an order kicks
 * the scan resolver, which is not something a stray Enter in a text field
 * should do.
 *
 * Notes land in `order_notes` via {@link useAppendOrderNote} — the append-only
 * trail. The scalar `orders.notes` is read-only history and has no writer.
 *
 * Events out:
 *  - `tech-upnext-action-start` → starts the previewed order
 *  - `tech-upnext-action-oos-set` → toggles orders.is_out_of_stock
 */
export function UpNextActionDock({ order }: UpNextActionDockProps) {
  const hasOutOfStock = orderIsOutOfStock(order);
  const [note, setNote] = useState('');
  const appendNote = useAppendOrderNote(order.id);

  const handleStart = useCallback(() => {
    dispatchUpNextActionStart({
      orderId: order.id,
      shipping_tracking_number: order.shipping_tracking_number,
      order_id: order.order_id,
    });
  }, [order.id, order.shipping_tracking_number, order.order_id]);

  const handleToggleOos = useCallback(() => {
    dispatchUpNextActionOos({
      orderId: order.id,
      isOutOfStock: !hasOutOfStock,
    });
  }, [order.id, hasOutOfStock]);

  const buildTerminal = useCallback(
    (kind: string) =>
      resolveShippingTerminal(kind, {
        onStart: handleStart,
        onOutOfStock: handleToggleOos,
        hasOutOfStock,
      }),
    [handleStart, handleToggleOos, hasOutOfStock],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'test',
    mode: 'shipping',
    tabId: null,
    build: buildTerminal,
  });

  const commitNote = useCallback(() => {
    const text = note.trim();
    if (!text || appendNote.isPending) return;
    appendNote.mutate(text, { onSuccess: () => setNote('') });
  }, [note, appendNote]);

  const bubbleTerminal = terminalVm ? (
    <div className="shrink-0" data-upnext-dock-terminal>
      <StationTerminalDock
        embedded
        embeddedChrome="pill"
        vm={terminalVm}
        assignedTechId={order.packer_id ?? order.tester_id ?? null}
      />
    </div>
  ) : null;

  return (
    <div
      className={slicedActionDockWrapperClass({ docked: false })}
      data-upnext-dock-float
    >
      <div className={`pointer-events-auto w-full min-w-0 ${STATION_WORKBENCH_COLUMN}`}>
        {terminalVm?.disabled && terminalVm.disabledReason ? (
          <p
            role="status"
            className="mb-1.5 text-right text-role-caption font-semibold text-amber-700"
          >
            {terminalVm.disabledReason}
          </p>
        ) : null}
        <OmnichannelComposerDock
          value={note}
          onChange={setNote}
          onCommit={commitNote}
          disabled={appendNote.isPending}
          placeholder="Add a note for this order…"
          ariaLabel="Order note"
          trailingAction={bubbleTerminal}
          chrome="raised"
        />
      </div>
    </div>
  );
}
