/**
 * Shipping workspace terminal slice — reserved for a future scan-complete CTA.
 * STATION_TERMINAL_REGISTRY.shipping maps every tab to `none` today, so
 * resolveTerminalKind returns null and StationTerminalDock stays hidden.
 *
 * When ShippingScanWorkspace gains a dock, add kinds here and update the
 * registry tabs map.
 */

import type { TerminalActionVm } from '@/lib/station-terminal';

export type ShippingView = 'ship' | 'units';

export function resolveShippingTerminal(_kind: string): TerminalActionVm | null {
  return null;
}
