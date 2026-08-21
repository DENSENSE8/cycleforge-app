'use client';

/**
 * Carton-bar action faces — geometry by construction.
 *
 * Listing / overflow / claim on the one-row strip go through these cells.
 * Height is `h-full` on the chrome class. Callers cannot pass `className`
 * or swap in IconButton. Photos stay on ReceivingPhotoButton appearance=chrome.
 */
import { forwardRef, useRef, type CSSProperties, type ReactNode } from 'react';
import { Copy, ExternalLink, Pencil, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ChipHoverMenuSurface } from '@/components/ui/ChipHoverMenuSurface';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import { listingMenuRows } from './carton-bar-menu-rows';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import {
  STATION_CHROME_GLYPH_CLASS,
} from './station-identity-chrome';
import {
  STATION_CONTEXT_ACTION_CELL_CLASS,
  STATION_CONTEXT_CLAIM_CHROME_CLASS,
  STATION_CONTEXT_LISTING_CHROME_CLASS,
} from './station-context-action-pill';

/** Row glyphs for the listing verbs — the row SoT stays icon-free. */
export const LISTING_MENU_ICONS = {
  open: <ExternalLink className="h-3.5 w-3.5" />,
  copy: <Copy className="h-3.5 w-3.5" />,
  edit: <Pencil className="h-3.5 w-3.5" />,
} as const;

export const StationContextIconCell = forwardRef<
  HTMLButtonElement,
  {
    ariaLabel: string;
    disabled?: boolean;
    onClick?: () => void;
    testId: string;
    children: ReactNode;
  }
>(function StationContextIconCell(
  { ariaLabel, disabled, onClick, testId, children },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={STATION_CONTEXT_ACTION_CELL_CLASS}
      data-testid={testId}
    >
      {children}
    </button>
  );
});

export function StationContextListingCell({
  label,
  ariaLabel,
  disabled,
  onClick,
  iconClass,
  iconStyle,
  openHref,
  copyValue,
  links = [],
  onEdit,
  editLabel = 'Edit',
}: {
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  iconClass?: string;
  iconStyle?: CSSProperties;
  openHref?: string | null;
  copyValue?: string | null;
  links?: Array<{ href: string; label: string; title?: string | null }>;
  onEdit?: () => void;
  editLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canCopy = (() => {
    const v = normalizeCopyText(copyValue);
    return !!v && v !== '---';
  })();
  const showActionMenu =
    !!onEdit || canCopy || !!openHref || links.filter((l) => l.href).length > 1;
  /**
   * One hover engine, one panel. This cell used to toggle an in-flow
   * `absolute` box with `visible/invisible` — its own third mechanism behind
   * the same class tokens, and the only one the locked-720 centre's
   * `overflow-hidden` could clip. It now drops the same portaled panel as the
   * identity chips and the classify pills.
   */
  const hover = useHoverSurface({ disabled: !showActionMenu });

  /** Verbs come from the SoT, so the `⋯` overflow cannot offer a different set. */
  const menuRows = listingMenuRows({
    label,
    ariaLabel,
    openHref,
    copyValue,
    links,
    onEdit,
    editLabel,
    onDone: hover.close,
    icons: LISTING_MENU_ICONS,
  });

  return (
    <div
      ref={hostRef}
      className="group relative flex h-full shrink-0 items-stretch"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      {...(showActionMenu ? hover.triggerProps : {})}
    >
      <HoverTooltip label={ariaLabel} asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={onClick}
          className={STATION_CONTEXT_LISTING_CHROME_CLASS}
          data-testid="carton-context-listing"
        >
          <span className={iconClass} style={iconStyle} aria-hidden>
            <ExternalLink className={STATION_CHROME_GLYPH_CLASS} />
          </span>
          <span className="leading-none">{label}</span>
        </button>
      </HoverTooltip>
      {showActionMenu ? (
        <ChipHoverMenuSurface
          open={hover.isOpen}
          onClose={hover.close}
          anchorRef={hostRef}
          menuLabel={`${label} actions`}
          rows={menuRows}
          surfaceProps={hover.surfaceProps}
        />
      ) : null}
    </div>
  );
}

export const StationContextClaimCell = forwardRef<
  HTMLButtonElement,
  { active?: boolean; onClick: () => void }
>(function StationContextClaimCell({ active, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={active ? 'Hide claim' : 'File claim'}
      aria-pressed={active}
      className={STATION_CONTEXT_CLAIM_CHROME_CLASS}
      data-testid="carton-context-claim"
    >
      <Ticket className={STATION_CHROME_GLYPH_CLASS} aria-hidden />
      <span className="leading-none">Claim</span>
    </button>
  );
});
