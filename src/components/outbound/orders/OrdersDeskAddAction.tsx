'use client';

/**
 * To-ship's intake CTA on the desk chrome's tab band.
 *
 * ## One track, not two buttons
 *
 * This was briefly two separate pill Buttons with a `gap-px` between them,
 * which read as two controls that happened to touch. The house already has the
 * shape: {@link SlicedActionDock} — one tone track with a hairline between a
 * primary segment and a chevron segment, `embeddedChrome="header"` giving the
 * same {@link cornerClass}(`'pill'`) capsule every other desk header CTA uses
 * ({@link DeskHeaderAction}). Composer-footer docks stay `embeddedChrome="pill"`
 * ({@link COMPOSER_SHELL_CORNER}); this slot is not that family.
 *
 * Segment order in header chrome is `[ primary CTA ]|[ ▾ menu ]`, so the
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
 * ## Sync is the primary; platforms, export, and manual add are in the menu
 *
 * Operator direction (2026-08-31 / 2026-09-01). The desk's dominant intake is
 * a bulk pull — Google Sheet on the face, connected channels in the chevron
 * (`Sync eBay · {connection}`, `Sync Amazon · {connection}`, `Sync Ecwid ·
 * {store}`, Sync more). Export CSV tucks into the same menu (not a header
 * `overall` button).
 * One-at-a-time typing stays the exception. (The single-order acknowledgment
 * intake still has its own front door: the `?triage=` overlay, reachable from
 * the Exceptions tab and deep links.)
 */

import { useMemo } from 'react';
import { FileText, Plus, RefreshCw, Download, ExternalLink } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  useDeskExportMenuAction,
} from '@/design-system/components/DeskActionSlot';
import { SlicedActionDock } from '@/design-system/primitives';
import { useToShipPlatformSyncMenu } from '@/components/outbound/orders/useToShipPlatformSyncMenu';

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
  const platformMenu = useToShipPlatformSyncMenu();
  const exportAction = useDeskExportMenuAction();

  // Memoized: the registrar re-registers whenever this node's identity changes,
  // and a fresh element every render would loop through the provider.
  const control = useMemo(
    () => (
      <div className="shrink-0" data-testid="orders-desk-add">
      <SlicedActionDock
        embedded
        embeddedChrome="header"
        tone="blue"
        icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
        label={syncing ? 'Syncing…' : 'Sync Google Sheet'}
        loading={syncing}
        onClick={() => onMethod('sync')}
        menuPlacement="bottom"
        menuChrome="dropdown"
        menuLabel="More intake methods"
        menu={[
          ...platformMenu.map((row) => ({
            label: row.label,
            icon:
              row.kind === 'more' ? (
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              ),
            onClick: row.onClick,
            disabled: row.disabled,
            separatorBefore: row.separatorBefore,
          })),
          ...(canImport
            ? [
                {
                  label: 'Upload orders CSV',
                  icon: <FileText aria-hidden className="h-3.5 w-3.5" />,
                  onClick: () => onMethod('file'),
                  separatorBefore: true,
                },
              ]
            : []),
          ...(exportAction
            ? [
                {
                  label: exportAction.empty
                    ? 'Export to CSV'
                    : `Export ${exportAction.rowCount} rows to CSV`,
                  icon: <Download aria-hidden className="h-3.5 w-3.5" />,
                  onClick: exportAction.run,
                  disabled: exportAction.empty,
                  separatorBefore: !canImport,
                },
              ]
            : []),
          {
            label: 'Add one order (review first)',
            icon: <Plus aria-hidden className="h-3.5 w-3.5" />,
            onClick: onAdd,
            separatorBefore: true,
          },
        ]}
        className="shrink-0"
      />
      </div>
    ),
    [onAdd, onMethod, canImport, syncing, platformMenu, exportAction],
  );

  return <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>;
}
