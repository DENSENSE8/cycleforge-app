/**
 * Shipping workspace terminal — preview Start CTA (+ Out of Stock split menu).
 *
 * Active scan tabs (`ship` / `units`) stay `none` in the registry (scan-driven).
 * Preview mode uses `defaultKind: 'start'` with tabId null.
 */

'use client';

import { Play, AlertCircle } from '@/components/Icons';
import type { TerminalActionVm } from '@/lib/station-terminal';

export type ShippingView = 'ship' | 'units' | 'timeline';

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
    maxWidth: 'max-w-3xl',
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
