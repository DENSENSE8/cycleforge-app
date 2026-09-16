'use client';

/**
 * Identity chip used across the condensed carton row. It supports the original
 * `[external-link] · [copy value] · [edit]` layout plus a compact action-menu
 * mode where the chip remains the primary action and Open/Edit move below it.
 *
 * When `editOpen`, the {@link CopyChip} face swaps to steady `editing` via the
 * shared `editing` prop — the identity row never drops digits, reflows, or pulses.
 */

import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Copy, ChevronDown, ExternalLink, Pencil, Info } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { CopyChip, type ChipTone } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import {
  ChipHoverMenuSurface,
  type ChipHoverMenuRow,
} from '@/components/ui/ChipHoverMenuSurface';
import { RECEIVING_CHIP_EDIT_BTN_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { recordCopy } from '@/lib/clipboard-history';
import { writeClipboardText } from '@/lib/clipboard';
import { buildOpenLinksHubHref } from '@/lib/receiving/listing-links';

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
  menuRows = [],
  suppressMenu = false,
  linkOptions,
  iconOnly = false,
  iconOnlyMark,
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
   * With {@link showCarrierBrand}, the leading mark is the carrier ring
   * {@link BrandIdentityDot} instead of a MapPin.
   */
  carrierHint?: string | null;
  /**
   * Catalog-resolved platform display name — prefixes the id chip tooltip
   * (`eBay 08-…`), mirroring carrier-prefixed tracking tooltips.
   */
  platformLabel?: string | null;
  /**
   * Opt into the carrier ring identity dot (carton identity). Grids omit this.
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
   * Rows after the first action (Open/Copy) — e.g. the ticket chip's
   * Message / Seller / Unlink cluster. **Data, not markup:** these
   * used to be a `menuBetween: ReactNode` where each caller hand-spelled the
   * menuitem classes, which is a row renderer forked per host. Edit (when
   * `editInMenu`) still renders after them.
   */
  menuRows?: ChipHoverMenuRow[];
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
}) {
  const normalizedValue = normalizeCopyText(value);
  const canCopy = !disableCopy && !!normalizedValue && normalizedValue !== '---';
  const carrierBrand =
    tone === 'tracking' && showCarrierBrand
      ? resolveCarrierBrand(value, carrierHint)
      : null;
  const carrierDot = carrierBrand ? carrierBrandDotPaint(carrierBrand) : null;
  const openExternal = () => {
    if (openHref) window.open(openHref, '_blank', 'noopener,noreferrer');
  };
  const copyValue = () => {
    if (!canCopy) return;
    // Same rule as `useCopyChip`: `navigator.clipboard` is undefined on an
    // insecure origin, so the bare call threw and took the panel down on the
    // LAN mounts. The history write only happens on a copy that landed.
    if (!writeClipboardText(normalizedValue)) return;
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
      menuRows.length > 0);
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
  /** Anchor for the portaled menu — the whole chip cluster, so it centres under the face. */
  const hostRef = useRef<HTMLDivElement | null>(null);

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
      ref={hostRef}
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
          <>
            {carrierDot ? (
              <BrandIdentityDot
                variant="ring"
                className={carrierDot.className}
                style={carrierDot.style}
              />
            ) : null}
            <CopyChip
            value={value}
            display={display}
            tone={tone}
            editing={isEditing}
            // Tone SoT wins; ExternalLink is listing-only.
            // Carton tracking uses the shared MapPin tracking tone by default.
            icon={
              tone ? (
                undefined
              ) : showExternalIcon ? (
                <ExternalLink className="h-4 w-4 shrink-0" />
              ) : undefined
            }
            iconClass={iconClass}
            iconStyle={iconStyle}
            width={grow ? 'min-w-0 flex-1 max-w-full' : 'w-auto'}
            // Default chip outerPad (`px-1.5`) — row stays gap-0 flush abut;
            // breathing lives on each face so listing text never jams the
            // ticket icon (same inset as Claim · Photos).
            disableCopy={disableCopy || isEditing}
            fitDisplayWidth={!grow}
            // Unbox SoT: locked last-8 never CSS-truncates (Arrival's old
            // TrackingChip dense fork ellipsized mid–last-8). Grow/listing
            // faces may truncate; identity locks do not.
            displayWidth={lockLast8Width ? 'last8' : 'content'}
            truncateDisplay={lockLast8Width ? false : grow}
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
          </>
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
        /**
         * ONE panel for the whole carton bar — {@link ChipHoverMenuSurface}
         * portals it bottom-CENTRED under the chip, the same grammar the
         * listing cell and the classify pills use. It was a hand-built
         * `AnchoredLayer` + raw rows here, a CSS-visibility box on the listing
         * cell and a Radix popper on the pills: three mechanisms behind one set
         * of class tokens, which is how they drifted apart.
         */
        <ChipHoverMenuSurface
          open={hover.isOpen}
          onClose={hover.close}
          anchorRef={hostRef}
          menuLabel={`${display} actions`}
          surfaceProps={hover.surfaceProps}
          rows={[
            ...(multiLinks
              ? [
                  {
                    id: '__open-all__',
                    label: 'Open all',
                    icon: <ExternalLink className="h-3.5 w-3.5" />,
                    tone: 'accent' as const,
                    ariaLabel: `Open all ${display} links`,
                    onSelect: () => {
                      openAllLinks();
                      hover.close();
                    },
                  },
                  ...multiLinks.map((opt) => ({
                    id: opt.href,
                    label: opt.label,
                    icon: <ExternalLink className="h-3.5 w-3.5" />,
                    tone: 'accent' as const,
                    ariaLabel: `Open ${opt.title ?? opt.label}`,
                    onSelect: () => {
                      window.open(opt.href, '_blank', 'noopener,noreferrer');
                      hover.close();
                    },
                  })),
                ]
              : []),
            menuFirstAction === 'open'
              ? {
                  id: '__open__',
                  label: 'Open',
                  icon: <ExternalLink className="h-3.5 w-3.5" />,
                  tone: 'accent' as const,
                  disabled: !openHref,
                  ariaLabel: openHref ? openTitle : 'No link available',
                  onSelect: () => {
                    openExternal();
                    hover.close();
                  },
                }
              : {
                  id: '__copy__',
                  label: 'Copy',
                  icon: <Copy className="h-3.5 w-3.5" />,
                  disabled: !canCopy,
                  ariaLabel: `Copy ${display}`,
                  onSelect: () => {
                    copyValue();
                    hover.close();
                  },
                },
            ...menuRows,
            ...(onEdit && editInMenu
              ? [
                  {
                    id: '__edit__',
                    label: editLabel ?? 'Edit',
                    icon: <Pencil className="h-3.5 w-3.5" />,
                    ariaExpanded: editOpen,
                    seam: true,
                    onSelect: () => {
                      onEdit();
                      hover.close();
                    },
                  } satisfies ChipHoverMenuRow,
                ]
              : []),
            ...(onDetails
              ? [
                  {
                    id: '__details__',
                    label: detailsLabel,
                    icon: <Info className="h-3.5 w-3.5" />,
                    seam: true,
                    onSelect: () => {
                      onDetails();
                      hover.close();
                    },
                  } satisfies ChipHoverMenuRow,
                ]
              : []),
          ]}
        />
      ) : null}
    </div>
  );
}
