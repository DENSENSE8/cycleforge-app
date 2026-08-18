'use client';

/**
 * Identity chip used across the condensed carton row. It supports the original
 * `[external-link] · [copy value] · [edit]` layout plus a compact action-menu
 * mode where the chip remains the primary action and Open/Edit move below it.
 *
 * When `editOpen`, the {@link CopyChip} face swaps to steady `editing` via the
 * shared `editing` prop — the identity row never drops digits, reflows, or pulses.
 */

import { type CSSProperties, type ReactNode } from 'react';
import { Copy, ChevronDown, ExternalLink, Pencil, Info } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { CarrierMark } from '@/components/ui/CarrierMark';
import { CopyChip, type ChipTone } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import {
  CHIP_HOVER_MENU_ITEM_CLASS,
  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
  CHIP_HOVER_MENU_ITEM_TONE,
  CHIP_HOVER_MENU_PANEL_CLASS,
} from '@/components/ui/copy-chip-hover-menu-chrome';
import { RECEIVING_CHIP_EDIT_BTN_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { hasCarrierBrandPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { recordCopy } from '@/lib/clipboard-history';
import { buildOpenLinksHubHref } from '@/lib/receiving/listing-links';
import { cn } from '@/utils/_cn';

export function IdentityLinkChip({
  openHref,
  openTitle,
  value,
  display,
  tone,
  iconClass,
  iconStyle,
  carrierHint = null,
  platformLabel = null,
  showCarrierBrand = false,
  disableCopy,
  onEdit,
  editOpen,
  editLabel,
  editInMenu = true,
  onDetails,
  detailsLabel = 'Show inspector',
  grow = false,
  lockLast8Width = false,
  actionsInMenu = false,
  chipAction = 'copy',
  showExternalIcon = false,
  menuFirstAction = 'open',
  menuBetween,
  suppressMenu = false,
  linkOptions,
  iconOnly = false,
  iconOnlyMark,
  menuPlacement = 'below',
}: {
  openHref: string | null | undefined;
  openTitle: string;
  /** Raw value copied to the clipboard. */
  value: string;
  /** Label shown in the chip (platform name / last-8 id). Hidden when `iconOnly`. */
  display: string;
  /**
   * Copy-chip tone — supplies the leading identity icon (id `#`, tracking pin,
   * etc.) so PO#/tracking read consistently with the ticket chip. Explicit
   * `iconClass` / `iconStyle` still win for color.
   */
  tone?: ChipTone;
  iconClass?: string;
  /** Inline icon paint (e.g. org platform `accentHex`). */
  iconStyle?: CSSProperties;
  /**
   * Authoritative carrier from the shipment / line (same ladder as Open URL).
   * With {@link showCarrierBrand}, known carriers tint the leading MapPin via
   * {@link CarrierMark} instead of the house-blue tracking tone.
   */
  carrierHint?: string | null;
  /**
   * Catalog-resolved platform display name — prefixes the id chip tooltip
   * (`eBay 08-…`), mirroring carrier-prefixed tracking tooltips.
   */
  platformLabel?: string | null;
  /**
   * Opt into carrier-colored MapPin (carton identity). Grids omit this.
   */
  showCarrierBrand?: boolean;
  disableCopy?: boolean;
  /** Toggles the below-row editor for this field. Omit to hide the pencil. */
  onEdit?: () => void;
  editOpen?: boolean;
  editLabel?: string;
  /**
   * When `actionsInMenu`, render the Edit menuitem. Ticket chip sets false —
   * History owns the push-column toggle; `onEdit` still drives edit face / chip click.
   */
  editInMenu?: boolean;
  /**
   * In-app connection / details inspector (e.g. IncomingDetailsPanel). Renders
   * after Edit when `actionsInMenu` (Open → Edit → Details).
   */
  onDetails?: () => void;
  detailsLabel?: string;
  /** Wide chip that fills the remaining row width (listing). Others hug last-8. */
  grow?: boolean;
  /** Lock the mono value face to an eight-character column. */
  lockLast8Width?: boolean;
  /** Move external-link/edit controls into a serial-chip-style hover menu. */
  actionsInMenu?: boolean;
  /** Primary action for the complete chip surface. */
  chipAction?: 'copy' | 'open';
  /**
   * Render the external-link glyph inside the clickable chip.
   * Tone icons win when `tone` is set — use this for listing-only (no tone).
   */
  showExternalIcon?: boolean;
  /** First menu row. Listing uses Copy; PO/tracking use Open. */
  menuFirstAction?: 'open' | 'copy';
  /**
   * Optional row(s) after the first action (Open/Copy) — e.g. ticket chip
   * History / Message / Unlink / Sync. Caller owns separators / menuitem markup.
   * Edit (when `editInMenu`) still renders after these rows.
   */
  menuBetween?: ReactNode;
  /**
   * Hide the hover menu while a sibling panel is open (seller message, etc.).
   * `editOpen` already suppresses; this covers other anchored panels.
   */
  suppressMenu?: boolean;
  /** Additional open targets — when length > 1, the hover menu lists every link. */
  linkOptions?: Array<{ href: string; label: string; title?: string }>;
  /**
   * Listing chrome: fixed-width platform mark instead of the variable-width
   * platform name. `display` stays the accessible / tooltip label. Pair with
   * `showExternalIcon` so missing-link state grays the ExternalLink glyph —
   * never opacity-wash the brand mark.
   */
  iconOnly?: boolean;
  /** Mark node (e.g. {@link PlatformMark}) when `iconOnly`. */
  iconOnlyMark?: ReactNode;
  /**
   * Hover-menu anchor. `below` = under the chip, left-aligned (ops default).
   * `left` = flush to the chip's left (Photos gallery grammar) — used by the
   * filed-ticket chip under Photos so the panel clears Claim / Displays.
   */
  menuPlacement?: 'below' | 'left';
}) {
  const normalizedValue = normalizeCopyText(value);
  const canCopy = !disableCopy && !!normalizedValue && normalizedValue !== '---';
  const carrierBrand =
    tone === 'tracking' && showCarrierBrand
      ? resolveCarrierBrand(value, carrierHint)
      : null;
  const carrierBrandPaint = carrierBrand != null && hasCarrierBrandPaint(carrierBrand);
  const openExternal = () => {
    if (openHref) window.open(openHref, '_blank', 'noopener,noreferrer');
  };
  const copyValue = () => {
    if (!canCopy) return;
    void navigator.clipboard.writeText(normalizedValue);
    recordCopy(normalizedValue, { kind: tone, display });
  };
  const multiLinks = (linkOptions?.length ?? 0) > 1 ? linkOptions! : null;
  const openAllLinks = () => {
    if (!multiLinks) return;
    // Reliable path: open a single hub tab; the user can open all from there
    // without the hover-menu popup blocker interference.
    window.open(buildOpenLinksHubHref(multiLinks), '_blank', 'noopener,noreferrer');
  };
  const hasMenuActions =
    actionsInMenu &&
    (!!onEdit ||
      !!onDetails ||
      menuFirstAction === 'copy' ||
      !!openHref ||
      multiLinks != null ||
      menuBetween != null);
  const showActionMenu = hasMenuActions && !editOpen && !suppressMenu;
  const isEditing = !!editOpen;

  /**
   * Hover-to-open comes from {@link useHoverSurface} — the ONE engine, shared
   * with the classify pills, the rail peek and the chip menus (0ms open, 150ms
   * close, one surface open at a time). This chip used to run its own
   * `useState` + `mouseenter/mouseleave` pair with no close delay and a
   * `duration-100` fade, which made it the fifth engine on a row that had just
   * been consolidated to one — and, because it never joined the registry, its
   * menu did not evict an open classify menu (two panels, one pointer).
   *
   * Open state stays LOCAL here (unlike `InlinePillPicker`, whose host lifts it
   * to drive the bar's `frozen` layout freeze). Nothing outside this chip needs
   * to know the menu is up, so there is no lifted mirror to keep in sync.
   */
  const hover = useHoverSurface({ disabled: !showActionMenu });

  const iconOnlyTooltip = openHref
    ? `${display} — ${openTitle}`
    : display
      ? `${display} — no link available`
      : 'No listing';

  // While editing, chip face reads steady "editing"; click closes the below-row field.
  // Empty chips with onEdit (e.g. unfound `# ----`) activate edit on click —
  // no value to copy, so the face itself is the Link-PO affordance.
  const emptyEditActivate = !canCopy && !!onEdit && !isEditing ? onEdit : undefined;
  const chipActivate = isEditing
    ? onEdit
    : chipAction === 'open'
      ? openExternal
      : emptyEditActivate;
  const chipActivateLabel = isEditing
    ? (editLabel ? `Done — ${editLabel}` : 'Done editing')
    : chipAction === 'open'
      ? openTitle
      : emptyEditActivate
        ? (editLabel ?? 'Edit')
        : undefined;

  return (
    <div
      className={`group relative flex items-center gap-0.5 ${
        iconOnly || !grow ? 'shrink-0' : 'min-w-0 flex-1'
      }`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      {...hover.triggerProps}
    >
      {!actionsInMenu ? (
        <HoverTooltip label={openHref ? openTitle : 'No link available'} asChild>
          <IconButton
            icon={<ExternalLink className="h-3.5 w-3.5 shrink-0" />}
            ariaLabel={openTitle}
            disabled={!openHref}
            onClick={openExternal}
            tone="accent"
            className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:text-text-faint disabled:opacity-60"
          />
        </HoverTooltip>
      ) : null}
      <div className={`flex min-w-0 items-center gap-0.5 ${grow && !iconOnly ? 'flex-1' : ''}`}>
        {iconOnly && iconOnlyMark ? (
          <>
            {showExternalIcon ? (
              <span
                className={`inline-flex shrink-0 items-center justify-center ${
                  iconClass ?? (openHref ? 'text-text-muted' : 'text-text-faint')
                }`}
                style={iconStyle}
                aria-hidden
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
              </span>
            ) : null}
            <HoverTooltip label={iconOnlyTooltip} asChild>
              {/* ds-raw-button: fixed-width platform mark face — not a DS Button.
                  Brand tiles stay full-color; missing-link state rides the
                  ExternalLink glyph (showExternalIcon), never opacity on the mark. */}
              <button
                type="button"
                onClick={chipActivate ?? copyValue}
                disabled={
                  isEditing
                    ? !onEdit
                    : chipAction === 'open'
                      ? !openHref && !onEdit
                      : !canCopy && !onEdit
                }
                aria-label={
                  isEditing
                    ? chipActivateLabel
                    : chipAction === 'open'
                      ? `${display}: ${openTitle}`
                      : emptyEditActivate
                        ? (chipActivateLabel ?? 'Edit')
                        : `Copy ${display}`
                }
                aria-busy={isEditing || undefined}
                className="inline-flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-hover active:scale-95 disabled:pointer-events-none"
              >
                {iconOnlyMark}
              </button>
            </HoverTooltip>
          </>
        ) : (
          <CopyChip
            value={value}
            display={display}
            tone={tone}
            editing={isEditing}
            // Tone SoT (# / MapPin / …) wins; ExternalLink is listing-only.
            // Carton tracking may tint the MapPin via CarrierMark (showCarrierBrand).
            icon={
              carrierBrandPaint && carrierBrand ? (
                <CarrierMark meta={carrierBrand} footprint="chip" />
              ) : tone ? (
                undefined
              ) : showExternalIcon ? (
                <ExternalLink className="h-4 w-4 shrink-0" />
              ) : undefined
            }
            iconClass={
              carrierBrandPaint
                ? 'text-inherit'
                : iconClass
            }
            iconStyle={carrierBrandPaint ? undefined : iconStyle}
            width={grow ? 'min-w-0 flex-1 max-w-full' : 'w-auto'}
            // Default chip outerPad (`px-1.5`) — row stays gap-0 flush abut;
            // breathing lives on each face so listing text never jams the
            // ticket icon (same inset as Claim · Photos).
            disableCopy={disableCopy || isEditing}
            fitDisplayWidth={!grow}
            displayWidth={lockLast8Width ? 'last8' : 'content'}
            truncateDisplay={grow}
            carrierHint={tone === 'tracking' ? carrierHint : null}
            platformLabel={tone === 'id' ? platformLabel : null}
            // Hover shows the full value via the site tooltip above. Open/Edit
            // opens **below** the chip (same px-1.5 as the face). Side flyouts
            // stay on LedgerGrid CopyChipHoverMenu, not this carton strip.
            tooltipTrigger="hover"
            onActivate={chipActivate}
            activationLabel={chipActivateLabel}
            activationTitle={
              isEditing
                ? chipActivateLabel
                : chipAction === 'open'
                  ? openHref
                    ? openTitle
                    : 'No link available'
                  : emptyEditActivate
                    ? (editLabel ?? 'Edit')
                    : undefined
            }
            activationDisabled={
              isEditing
                ? !onEdit
                : chipAction === 'open' && !openHref && !onEdit
            }
          />
        )}
        {multiLinks ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
        ) : null}
      </div>
      {!actionsInMenu && onEdit ? (
        <HoverTooltip label={editOpen ? 'Done editing' : (editLabel ?? '')} asChild>
          <IconButton
            icon={<Pencil className="h-3 w-3" />}
            ariaLabel={editLabel ?? ''}
            onClick={onEdit}
            aria-expanded={editOpen}
            className={RECEIVING_CHIP_EDIT_BTN_CLASS}
          />
        </HoverTooltip>
      ) : null}
      {showActionMenu ? (
        <div
          // Local hover menu matching SerialChipWithMenu; it is intentionally
          // outside the app-wide portal/overlay stack. Hidden while editOpen so
          // anchored previews (ticket history) are the only panel shown.
          // Hover-only visibility — focus-within kept menus stuck open after a
          // chip click (especially chips on the wrapped second row).
          // z-panelPopover + station-bar z-10 sibling beat the workbench so the
          // menu is not covered/clipped when it opens beside/below the chips.
          // Flush-square + left: same chrome as Photos `CopyChipHoverMenuPanel`
          // (never `rounded-lg` / centered under the face).
          //
          // NO fade. This row animates nothing: opening is instant, so there is
          // no appear animation for a `duration-100` opacity ramp to match — it
          // only delays the data reaching the operator's eye. The panel is a DOM
          // child of the trigger, so `mouseleave` does not fire crossing onto
          // it; `surfaceProps` still cancels the pending close for the portal-
          // like `right-full` placement.
          {...hover.surfaceProps}
          className={cn(
            'absolute z-panelPopover',
            menuPlacement === 'left'
              ? 'right-full top-0'
              : 'left-0 top-full pt-1.5',
            hover.isOpen
              ? 'visible pointer-events-auto'
              : 'invisible pointer-events-none',
          )}
        >
          <div
            role="menu"
            aria-label={`${display} actions`}
            className={CHIP_HOVER_MENU_PANEL_CLASS}
          >
            {multiLinks ? (
              <>
                {/* ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={openAllLinks}
                  aria-label={`Open all ${display} links`}
                  className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.accent)}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  Open all
                </button>
                <div className="border-t border-border-hairline" role="separator" />
                {multiLinks.map((opt) => (
                  <HoverTooltip key={opt.href} label={opt.title ?? opt.label} asChild>
                    {/* ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => window.open(opt.href, '_blank', 'noopener,noreferrer')}
                      aria-label={`Open ${opt.label}`}
                      className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.accent)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span className="min-w-0 truncate normal-case tracking-normal">{opt.label}</span>
                    </button>
                  </HoverTooltip>
                ))}
                <div className="border-t border-border-hairline" role="separator" />
              </>
            ) : null}
            {menuFirstAction === 'open' ? (
              <HoverTooltip label={openHref ? openTitle : 'No link available'} asChild>
                {/* ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button */}
                <button
                  type="button"
                  role="menuitem"
                  disabled={!openHref}
                  onClick={openExternal}
                  aria-label={openTitle}
                  className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.accent)}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  Open
                </button>
              </HoverTooltip>
            ) : (
              // ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button
              <button
                type="button"
                role="menuitem"
                disabled={!canCopy}
                onClick={copyValue}
                aria-label={`Copy ${display}`}
                className={cn(CHIP_HOVER_MENU_ITEM_CLASS, CHIP_HOVER_MENU_ITEM_TONE.default)}
              >
                <Copy className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                Copy
              </button>
            )}
            {menuBetween}
            {onEdit && editInMenu ? (
              // ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button
              <button
                type="button"
                role="menuitem"
                onClick={onEdit}
                aria-expanded={editOpen}
                aria-label={editLabel}
                className={cn(
                  CHIP_HOVER_MENU_ITEM_CLASS,
                  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
                  CHIP_HOVER_MENU_ITEM_TONE.default,
                )}
              >
                <Pencil className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                Edit
              </button>
            ) : null}
            {onDetails ? (
              // ds-raw-button: text-left dropdown menuitem row (icon + label)
              <button
                type="button"
                role="menuitem"
                onClick={onDetails}
                aria-label={detailsLabel}
                className={cn(
                  CHIP_HOVER_MENU_ITEM_CLASS,
                  CHIP_HOVER_MENU_ITEM_SEAM_CLASS,
                  CHIP_HOVER_MENU_ITEM_TONE.default,
                )}
              >
                <Info className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                {detailsLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
