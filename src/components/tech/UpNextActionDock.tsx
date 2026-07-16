'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { OutOfStockEditorBlock } from '@/components/ui/OutOfStockEditorBlock';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
import {
  dispatchUpNextActionStart,
  dispatchUpNextActionOos,
} from '@/utils/events';
import type { Order } from '@/components/station/upnext/upnext-types';
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
 * Terminal action surface for the shipping preview workspace — Start CTA with
 * an optional split menu for Out of Stock. Routes through
 * {@link STATION_TERMINAL_REGISTRY}.shipping + {@link StationTerminalDock}
 * (Unbox-family waist) instead of a raw FloatingButton.
 *
 * Events out:
 *  - `tech-upnext-action-start` → starts the previewed order
 *  - `tech-upnext-action-oos-set` → marks the order out-of-stock with a reason
 */
export function UpNextActionDock({ order }: UpNextActionDockProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [reason, setReason] = useState(order.out_of_stock ?? '');
  const hasOutOfStock = Boolean((order.out_of_stock ?? '').trim());

  useEffect(() => {
    setShowEditor(false);
    setReason(order.out_of_stock ?? '');
  }, [order.id, order.out_of_stock]);

  const handleStart = useCallback(() => {
    dispatchUpNextActionStart({
      orderId: order.id,
      shipping_tracking_number: order.shipping_tracking_number,
      order_id: order.order_id,
    });
  }, [order.id, order.shipping_tracking_number, order.order_id]);

  const handleOosSubmit = useCallback(() => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    dispatchUpNextActionOos({ orderId: order.id, reason: trimmed });
    setShowEditor(false);
  }, [order.id, reason]);

  const buildTerminal = useCallback(
    (kind: string) =>
      resolveShippingTerminal(kind, {
        onStart: handleStart,
        onOutOfStock: () => setShowEditor(true),
        hasOutOfStock,
      }),
    [handleStart, hasOutOfStock],
  );

  const terminalVm = useStationTerminalAction({
    surface: 'test',
    mode: 'shipping',
    tabId: null,
    build: buildTerminal,
  });

  return (
    <>
      <AnimatePresence initial={false}>
        {showEditor ? (
          <motion.div
            key="oos-editor"
            initial={framerPresence.collapseHeight.initial}
            animate={framerPresence.collapseHeight.animate}
            exit={framerPresence.collapseHeight.exit}
            transition={framerTransition.upNextCollapse}
            className="pointer-events-none absolute inset-x-0 bottom-[calc(3.75rem+max(1rem,env(safe-area-inset-bottom)))] z-20 px-4 sm:px-6"
          >
            <div className="pointer-events-auto mx-auto w-full max-w-3xl">
              <div className="rounded-2xl bg-surface-card px-4 py-3 shadow-lg ring-1 ring-border-soft">
                <OutOfStockEditorBlock
                  value={reason}
                  onChange={setReason}
                  onCancel={() => {
                    setShowEditor(false);
                    setReason(order.out_of_stock ?? '');
                  }}
                  onSubmit={handleOosSubmit}
                  autoFocus
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <StationTerminalDock vm={terminalVm} />
    </>
  );
}
