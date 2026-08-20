'use client';

/**
 * Carton-bar action faces — geometry by construction.
 *
 * Listing / overflow / claim on the one-row strip go through these cells.
 * Height is `h-full` on the chrome class. Callers cannot pass `className`
 * or swap in IconButton. Photos stay on ReceivingPhotoButton appearance=chrome.
 */
import { forwardRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Copy, ExternalLink, Pencil, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  CHIP_HOVER_MENU_ITEM_CLASS,
  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
  CHIP_HOVER_MENU_ITEM_TONE,
  CHIP_HOVER_MENU_PANEL_CLASS,
} from '@/components/ui/copy-chip-hover-menu-chrome';
import { recordCopy } from '@/lib/clipboard-history';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { buildOpenLinksHubHref } from '@/lib/receiving/listing-links';
import { cn } from '@/utils/_cn';
import {
  STATION_CHROME_BAR_MENU_ANCHOR,
  STATION_CHROME_GLYPH_CLASS,
} from './station-identity-chrome';
import {
  STATION_CONTEXT_ACTION_CELL_CLASS,
  STATION_CONTEXT_CLAIM_CHROME_CLASS,
  STATION_CONTEXT_LISTING_CHROME_CLASS,
} from './station-context-action-pill';

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
  const [menuHover, setMenuHover] = useState(false);
  const normalizedValue = normalizeCopyText(copyValue);
  const canCopy = !!normalizedValue && normalizedValue !== '---';
  const linkOptions = links.filter((l) => l.href);
  const multiLinks = linkOptions.length > 1 ? linkOptions : null;
  const showActionMenu = !!onEdit || canCopy || !!openHref || multiLinks != null;

  const openAllLinks = () => {
    if (!multiLinks) return;
    window.open(buildOpenLinksHubHref(multiLinks), '_blank', 'noopener,noreferrer');
  };

  const copyListing = () => {
    if (!canCopy) return;
    void navigator.clipboard.writeText(normalizedValue);
    recordCopy(normalizedValue, { kind: 'listing', display: label });
  };

  return (
    <div
      className="group relative flex h-full shrink-0 items-stretch"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        if (showActionMenu) setMenuHover(true);
      }}
      onMouseLeave={() => setMenuHover(false)}
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
        <div
          className={cn(
            // Centered on the trigger, not left-aligned to it: the carton bar
            // is a row of narrow abutting cells, so a start-aligned panel puts
            // its body under a NEIGHBOUR and reads as that cell's menu.
            STATION_CHROME_BAR_MENU_ANCHOR,
            'transition-opacity duration-100',
            menuHover
              ? 'visible pointer-events-auto opacity-100'
              : 'invisible pointer-events-none opacity-0',
          )}
        >
          <div
            role="menu"
            aria-label={`${label} actions`}
            className={CHIP_HOVER_MENU_PANEL_CLASS}
          >
            {multiLinks ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={openAllLinks}
                  aria-label={`Open all ${label} links`}
                  className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.accent)}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  Open all
                </button>
                <div className="border-t border-border-hairline" role="separator" />
                {multiLinks.map((opt) => (
                  <HoverTooltip key={opt.href} label={opt.title ?? opt.label} asChild>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => window.open(opt.href, '_blank', 'noopener,noreferrer')}
                      aria-label={`Open ${opt.label}`}
                      className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.accent)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span className="min-w-0 truncate">{opt.label}</span>
                    </button>
                  </HoverTooltip>
                ))}
                <div className="border-t border-border-hairline" role="separator" />
              </>
            ) : null}
            <HoverTooltip label={openHref ? ariaLabel : 'No link available'} asChild>
              <button
                type="button"
                role="menuitem"
                disabled={!openHref}
                onClick={() => {
                  if (openHref) window.open(openHref, '_blank', 'noopener,noreferrer');
                }}
                aria-label={ariaLabel}
                className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.accent)}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                Open
              </button>
            </HoverTooltip>
            <button
              type="button"
              role="menuitem"
              disabled={!canCopy}
              onClick={copyListing}
              aria-label={`Copy ${label}`}
              className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.default)}
            >
              <Copy className="h-3.5 w-3.5 shrink-0 text-text-soft" />
              Copy
            </button>
            {onEdit ? (
              <button
                type="button"
                role="menuitem"
                onClick={onEdit}
                aria-label={editLabel}
                className={cn(
                  CHIP_HOVER_MENU_ITEM_CLASS,
                  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
                  CHIP_HOVER_MENU_ITEM_TONE.default,
                )}
              >
                <Pencil className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                {editLabel}
              </button>
            ) : null}
          </div>
        </div>
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
