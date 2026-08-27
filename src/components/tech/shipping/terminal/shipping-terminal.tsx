/**
 * Shipping workspace terminal — preview Start CTA (+ Out of Stock split menu).
 *
 * Active Pack centre is scan-driven (`none` in the registry). Preview mode uses
 * `defaultKind: 'start'` with tabId null. Units live on Displays, not a centre tab.
 */

'use client';

import { Play, AlertCircle } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';

/** Dock track width — matches STATION_WORKBENCH_COLUMN (720), like unbox-terminal. */
const SHIPPING_DOCK_MAX = 'max-w-[720px]';

export interface ShippingTerminalContext {
  /** Preview Start handler. */
  onStart: () => void;
  /** Open / toggle the Out of Stock editor. */
  onOutOfStock: () => void;
  hasOutOfStock: boolean;
}

export function resolveShippingTerminal(
  kind: string,
  ctx: ShippingTerminalContext,
): TerminalActionVm | null {
  if (kind !== 'start') return null;

  return {
    label: 'Start',
    onClick: ctx.onStart,
    icon: <Play className="h-4 w-4 shrink-0" />,
    tone: 'accent',
    maxWidth: SHIPPING_DOCK_MAX,
    fullWidth: true,
    menuLabel: 'Order actions',
    menuTitle: 'More order actions',
    menu: [
      {
        label: ctx.hasOutOfStock ? 'Update Out of Stock' : 'Out of Stock',
        icon: <AlertCircle className="h-3.5 w-3.5 shrink-0" />,
        onClick: ctx.onOutOfStock,
      },
    ],
  };
}
