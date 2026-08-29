'use client';

/**
 * Incoming inspector chrome + rail identity.
 *
 * **The identity band is GONE (2026-08-21).** This file used to export an
 * `IncomingDetailsHeader` that painted `[▣ Purchase order / PO-1234]` as a
 * SECOND row above {@link DeskInspectorIndexShell}'s band — an eyebrow+title
 * pair on two lines, on a rail whose contract is ONE band. The band now carries
 * a single-segment title, so the header had no job left and was deleted with
 * its status/vendor derivation; the row's identity reads from the body
 * (`InventoryPoHeader`) and from the grid row that opened the rail.
 *
 * What remains: the verbs the shell's band renders ({@link
 * IncomingDetailsChrome}) and the stable occupant id.
 */

import { RefreshCw } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { PaneHeaderActionBarAction } from '@/components/ui/pane-header';
import { IconButton } from '@/design-system/primitives';

/**
 * Incoming chrome for the shell's ONE band — selection verbs · Sync · `▦`.
 *
 * Split out of the header 2026-08-19. It used to ride a `DeskRailChromeRow`
 * stacked ABOVE `DeskInspectorIndexShell`, which made every leaf read as two
 * bands (`[verbs ⤢ ✕]` then `[‹ Title]`). The shell owns the single band now,
 * so the panel passes this to its `chrome` slot instead.
 */
export function IncomingDetailsChrome({
  isShipmentOnly,
  isInboundOnly,
  isCartonOnly = false,
  syncing,
  onSync,
  selectionActions = [],
}: {
  isShipmentOnly: boolean;
  isInboundOnly: boolean;
  isCartonOnly?: boolean;
  syncing: boolean;
  onSync: () => void;
  selectionActions?: PaneHeaderActionBarAction[];
}) {
  const hideSync = isShipmentOnly || isCartonOnly;
  const syncTitle = isInboundOnly
    ? 'Re-pull this order from linked marketplace accounts (eBay) + re-poll its shipment'
    : 'Re-pull this PO from inventory + re-poll its shipment';
  const syncAria = isInboundOnly ? 'Resync this marketplace order' : 'Sync this PO';
  return (
    <>
      {selectionActions.length > 0 || !hideSync ? (
            <>
              {selectionActions.map((action) => {
                const label =
                  action.title ??
                  (typeof action.label === 'string' ? action.label : action.key);
                return (
                  <HoverTooltip key={action.key} label={label} asChild>
                    <IconButton
                      size="xs"
                      tone="neutral"
                      disabled={action.disabled}
                      ariaLabel={label}
                      onClick={action.onClick}
                      icon={action.icon}
                    />
                  </HoverTooltip>
                );
              })}
              {hideSync ? null : (
                <HoverTooltip label={syncTitle} asChild>
                  <IconButton
                    size="xs"
                    tone="neutral"
                    disabled={syncing}
                    ariaLabel={syncAria}
                    onClick={onSync}
                    data-testid="incoming-details-sync"
                    className="text-emerald-700"
                    icon={
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    }
                  />
                </HoverTooltip>
              )}
            </>
      ) : null}
    </>
  );
}

/**
 * RightRailHost occupant id for the Incoming inspector — STABLE, deliberately
 * NOT keyed on the row.
 *
 * The host keys its `AnimatePresence mode="wait"` on the occupant id, so the
 * old per-record ids (`detail:incoming:<poId>` / `:shipment:<id>` /
 * `:inbound:<type>:<id>`) made every row→row step a full exit-then-enter with
 * an empty slot in between. Walking the Incoming grid row by row is the core
 * loop on that surface. One stable id keeps the aside mounted and swaps its
 * node in place (the store's `updateRightRailPanelNode` path) — the same
 * queue-processing exception `detail:order` takes (`display/motion-crossfade.md`).
 *
 * Safe because the panel re-seeds on row change: `useIncomingDetails` re-keys
 * its query on the row identity and resets the open tab to that row's default.
 */
export const INCOMING_DETAILS_RAIL_ID = 'detail:incoming';

/** Accessible name for the non-modal aside — the row's own identity. */
export function incomingDetailsAriaLabel(identity: string): string {
  const trimmed = identity.trim();
  return trimmed ? `Incoming ${trimmed} details` : 'Incoming details';
}
