'use client';

/**
 * The ONE drop-panel display for carton-context chrome.
 *
 * Every menu the carton identity bar opens — identity chips (Open / Edit),
 * the listing cell, the classify pills (urgency · platform · type) — renders
 * through this component, so the strip drops ONE panel with one anchoring, one
 * row anatomy and one seam rule rather than three near-twins that only agreed
 * by luck.
 *
 * Before 2026-08-20 there were three mechanisms behind the same class tokens:
 * an `AnchoredLayer` portal (identity chips), a CSS-visibility `absolute` box
 * (listing cell) and a Radix `DropdownMenu` (classify pills). They anchored
 * differently (portal-centred vs in-flow vs Radix popper), painted their rows
 * differently (icon rows vs dot rows), and only the portal escaped the locked
 * 720 centre's `overflow-hidden`. Picking "Medium" off a pill therefore looked
 * like a different product from picking "Open" off the tracking chip one cell
 * to the left.
 *
 * Contract:
 * - **Portaled** (`AnchoredLayer`), bottom-CENTRE under the trigger cell. The
 *   bar is a row of narrow abutting cells: a start-aligned panel puts its body
 *   under a NEIGHBOUR and reads as that cell's menu.
 * - **No appear animation.** The bench reads the panel the instant it exists.
 * - Open/close timing belongs to {@link useHoverSurface} — the caller owns the
 *   hover engine and hands this component `open` + `surfaceProps`.
 *
 * Chrome tokens stay in `copy-chip-hover-menu-chrome.ts`; this file owns the
 * SHAPE (panel → rows → seams), which is what was forking.
 */

import type { ReactNode, RefObject } from 'react';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import {
  CHIP_HOVER_MENU_ICON_CLASS,
  CHIP_HOVER_MENU_ITEM_CLASS,
  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
  CHIP_HOVER_MENU_ITEM_TONE,
  CHIP_HOVER_MENU_PANEL_CLASS,
} from '@/components/ui/copy-chip-hover-menu-chrome';
import { cn } from '@/utils/_cn';

type ChipHoverMenuRowTone = 'default' | 'accent' | 'danger';

type ChipHoverMenuActionRow = {
  id: string;
  label: string;
  /**
   * Row glyph — an icon OR an identity dot. It rides the same 3.5 box for every
   * row of every menu, so option labels start at the same x as Open / Edit.
   */
  icon?: ReactNode;
  /**
   * Skip the tone-derived icon ink (identity dots carry their own colour, which
   * is the FACT the row is showing).
   */
  rawIcon?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  tone?: ChipHoverMenuRowTone;
  /** Current value — the selected rung of a classify ladder. */
  active?: boolean;
  /** aria-label when the visible label is short (`title` on the option SoT). */
  ariaLabel?: string;
  ariaExpanded?: boolean;
  /**
   * Force the leading hairline. Default: every row after the first carries it.
   * Pass `false` to fuse a row to the one above (grouped links).
   */
  seam?: boolean;
  'data-testid'?: string;
};

/**
 * Escape for a row the host still paints itself (a ticket chip's History /
 * Unlink cluster). It renders in list order, so a bespoke row cannot drift out
 * of sequence the way a trailing `children` slot could.
 */
type ChipHoverMenuNodeRow = { id: string; node: ReactNode };

export type ChipHoverMenuRow = ChipHoverMenuActionRow | ChipHoverMenuNodeRow;

function iconTone(tone: ChipHoverMenuRowTone | undefined): string {
  return tone === 'danger'
    ? 'text-rose-600'
    : tone === 'accent'
      ? 'text-blue-600'
      : 'text-text-soft';
}

/**
 * Presentational panel + rows — the ONE menu-row renderer.
 *
 * Exported only for {@link CopyChipHoverMenu}, the LedgerGrid SIDE flyout,
 * which owns its own positioning for a documented reason (a below-chip menu
 * sits in the vertical row-scan path and blocks travel to the next row). Its
 * placement differs; its rows must not. Anything that drops a menu BELOW a
 * chip composes {@link ChipHoverMenuSurface} instead — a second door into the
 * panel is the first step back to per-host anchoring.
 */
export function ChipHoverMenuPanel({
  menuLabel,
  rows,
  children,
  className,
  itemPad = 'chip',
  emphasizeLabel = false,
  'data-testid': dataTestId,
  ...rest
}: {
  menuLabel: string;
  rows?: ChipHoverMenuRow[];
  /** Extra rows a host still paints itself (grouped links, custom slots). */
  children?: ReactNode;
  className?: string;
  /**
   * `chip` — carton / photo-toolbar rows match the chip face (`px-1.5` `gap-1.5`).
   * `roomy` — LedgerGrid menu breathing room (`px-3` `gap-2`).
   */
  itemPad?: 'chip' | 'roomy';
  /** LedgerGrid dashboard labels ride semibold; carton rows inherit the chip face. */
  emphasizeLabel?: boolean;
  'data-testid'?: string;
} & Record<string, unknown>) {
  return (
    <div
      role="menu"
      aria-label={menuLabel}
      data-testid={dataTestId}
      className={cn(CHIP_HOVER_MENU_PANEL_CLASS, className)}
      {...rest}
    >
      {(rows ?? []).map((row, i) =>
        'node' in row ? (
          <div key={row.id} className="contents">
            {row.node}
          </div>
        ) : (
        // ds-raw-button: text-left dropdown menuitem row (icon + label)
        <button
          key={row.id}
          type="button"
          role="menuitem"
          disabled={row.disabled}
          aria-label={row.ariaLabel ?? row.label}
          aria-expanded={row.ariaExpanded}
          data-testid={row['data-testid']}
          onClick={(e) => {
            e.stopPropagation();
            if (row.disabled) return;
            row.onSelect();
          }}
          className={cn(
            CHIP_HOVER_MENU_ITEM_CLASS,
            itemPad === 'roomy' && 'gap-2 px-3',
            (row.seam ?? i > 0) && CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
            row.active
              ? CHIP_HOVER_MENU_ITEM_TONE.active
              : CHIP_HOVER_MENU_ITEM_TONE[row.tone ?? 'default'],
          )}
        >
          {row.icon ? (
            <span
              className={cn(
                CHIP_HOVER_MENU_ICON_CLASS,
                !row.rawIcon && iconTone(row.tone),
              )}
              aria-hidden
            >
              {row.icon}
            </span>
          ) : null}
          <span className={cn('min-w-0 flex-1 truncate', emphasizeLabel && 'font-semibold')}>
            {row.label}
          </span>
        </button>
        ),
      )}
      {children}
    </div>
  );
}

/**
 * The hover-opened form: the panel above, portaled and centred under the
 * trigger cell. `surfaceProps` comes from the caller's {@link useHoverSurface}
 * — a portal means the pointer crossing the seam is a real DOM exit, so the
 * hook's pointer guard (not raw leave events) keeps the panel reachable.
 */
export function ChipHoverMenuSurface({
  open,
  onClose,
  anchorRef,
  menuLabel,
  rows,
  children,
  surfaceProps,
  'data-testid': dataTestId,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  menuLabel: string;
  rows?: ChipHoverMenuRow[];
  children?: ReactNode;
  /** `hover.surfaceProps` from the caller's hover engine. */
  surfaceProps?: Record<string, unknown>;
  'data-testid'?: string;
}) {
  return (
    <AnchoredLayer
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-center"
      level="panelPopover"
      gap={6}
      className="w-max"
    >
      <ChipHoverMenuPanel
        menuLabel={menuLabel}
        rows={rows}
        data-testid={dataTestId}
        {...(surfaceProps ?? {})}
      >
        {children}
      </ChipHoverMenuPanel>
    </AnchoredLayer>
  );
}
