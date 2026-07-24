'use client';

import { useCallback } from 'react';
import { StationTerminalDock, useStationTerminalAction } from '@/components/station/terminal';
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
 * Terminal action surface for the shipping preview workspace — Start CTA with
 * an optional split menu for Out of Stock. Routes through
 * {@link STATION_TERMINAL_REGISTRY}.shipping + {@link StationTerminalDock}
 * (Unbox-family waist) instead of a raw SlicedActionDock.
 *
 * Events out:
 *  - `tech-upnext-action-start` → starts the previewed order
 *  - `tech-upnext-action-oos-set` → toggles orders.is_out_of_stock
 */
export function UpNextActionDock({ order }: UpNextActionDockProps) {
  const hasOutOfStock = orderIsOutOfStock(order);

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

  return <StationTerminalDock vm={terminalVm} />;
}
