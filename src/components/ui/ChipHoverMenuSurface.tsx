'use client';

/** The ONE drop-panel display for carton-context chrome. */

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

/** Presentational panel + rows — the ONE menu-row renderer. */
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

/** The hover-opened form: */
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
      // Flush to the cell — no dead band between the hovered face and the panel it opened.
      gap={0}
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
