'use client';

/**
 * To-ship's intake CTA on the desk chrome's tab band.
 *
 * ## One track, not two buttons
 *
 * This was briefly two separate pill Buttons with a `gap-px` between them,
 * which read as two controls that happened to touch. The house already has the
 * shape: {@link SlicedActionDock} — one tone track with a hairline between a
 * primary segment and a chevron segment, `embeddedChrome="pill"` giving the
 * composer-footer face. It is the same control as Unbox's trailing
 * **Print · Receive** split, which is what this should have been from the
 * start.
 *
 * Segment order in composer-pill mode is `[ primary CTA ]|[ ▾ menu ]`, so the
 * CTA's own icon sits between its label and the chevron.
 *
 * ## The chevron's menu is a sentence-case dropdown, not station caps
 *
 * `menuChrome="dropdown"` — the dock's own Popover menu sets items in ALL CAPS,
 * which is Unbox's Print · Receive look and contradicts the operator's "no caps
 * lock" direction (2026-08-31). This desk takes the house `DropdownMenu`
 * (Radix, shadcn-shaped) instead: sentence case at the CTA label's own
 * `text-role-caption`, on a panel whose corner matches the pill track. The
 * integrated one-track CTA is unchanged; only the menu's voice is.
 *
 * ## Sizing: the house CTA face, glyph included
 *
 * The composer pill renders `h-8 px-3 text-role-caption font-semibold` — the
 * same face as `Button size="sm"`, which is this desk's CTA vocabulary
 * (the exceptions workbench, the intake form, CSV staging). The label
 * needed nothing.
 *
 * The **icon** did. `SlicedActionDock` does not box its leading glyph — every
 * other call site sizes its own — and `RefreshCw` defaults to `w-6 h-6`. This
 * was the one call site passing it bare, so a 24px glyph sat beside a 12px
 * label and the button read a size larger than every CTA around it. `h-3.5
 * w-3.5` is `Button`'s own `iconBox.sm`, and matches this file's menu glyphs.
 *
 * ## No rail behind it
 *
 * Every method here used to open a leaf of `OrderIngestRail` — an Add-orders
 * index in the right rail whose leaves each held one button. The rail is gone
 * (operator, 2026-08-31): the CTA already listed the methods, so the rail was a
 * second front door onto a menu that already existed. `onMethod` now runs the
 * work on the desk itself.
 *
 * ## Sync is the primary, manual add is in the menu
 *
 * Operator direction (2026-08-31). The desk's dominant intake is a bulk pull —
 * Google Sheet plus the connected channels — and one-at-a-time typing is the
 * exception, so the face does the bulk pull and the chevron carries the rest.
 * (The single-order acknowledgment intake still has its own front door: the
 * `?triage=` overlay, reachable from the Exceptions tab and deep links.)
 */

import { useMemo } from 'react';
import { FileText, Plus, RefreshCw } from '@/components/Icons';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { SlicedActionDock } from '@/design-system/primitives';

/**
 * What the CTA runs directly. There is no rail behind these any more — the desk
 * host does the work (operator, 2026-08-31).
 *
 * `manual` and `backfill` are gone with it. Hand entry was never rail-only: it
 * is the centered `OrderIntakeOverlay`, which is what `onAdd` opens, so the
 * rail's manual leaf was a second door onto the same job. Backfill's
 * `AwaitingEbayPanel` had no other host and left with the rail.
 */
export type OrderIntakeMethod = 'file' | 'sync';

export function OrdersDeskAddAction({
  onAdd,
  onMethod,
  canImport = true,
  syncing = false,
}: {
  /** The acknowledgment intake for ONE order (`?triage=new`). */
  onAdd: () => void;
  /** Run a bulk method on the desk — sync now, or open the CSV picker. */
  onMethod: (method: OrderIntakeMethod) => void;
  /** `orders.import` (and a live import descriptor) — hides the CSV item. */
  canImport?: boolean;
  /** A sync is already running; the face reports it rather than starting a second. */
  syncing?: boolean;
}) {
  // Memoized: the registrar re-registers whenever this node's identity changes,
  // and a fresh element every render would loop through the provider.
  const control = useMemo(
    () => (
      <div className="shrink-0" data-testid="orders-desk-add">
      <SlicedActionDock
        embedded
        embeddedChrome="pill"
        tone="blue"
        icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
        label={syncing ? 'Syncing…' : 'Sync Google Sheet'}
        loading={syncing}
        onClick={() => onMethod('sync')}
        menuPlacement="bottom"
        menuChrome="dropdown"
        menuLabel="More intake methods"
        menu={[
          {
            label: 'Add one order (review first)',
            icon: <Plus aria-hidden className="h-3.5 w-3.5" />,
            onClick: onAdd,
          },
          ...(canImport
            ? [
                {
                  label: 'Import from file (CSV)',
                  icon: <FileText aria-hidden className="h-3.5 w-3.5" />,
                  onClick: () => onMethod('file'),
                  separatorBefore: true,
                },
              ]
            : []),
        ]}
        className="shrink-0"
      />
      </div>
    ),
    [onAdd, onMethod, canImport, syncing],
  );

  return <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>;
}
