'use client';

/**
 * Identity chip used across the condensed carton row. It supports the original
 * `[external-link] · [copy value] · [edit]` layout plus a compact action-menu
 * mode where the chip remains the primary action and Open/Edit move below it.
 *
 * When `editOpen`, the {@link CopyChip} face pulses `edit` (4 chars) via the
 * shared `editing` prop — the identity row never drops digits or reflows.
 */

import { useState, type ReactNode } from 'react';
import { Copy, ChevronDown, ExternalLink, Pencil } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { CopyChip, type ChipTone } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RECEIVING_CHIP_EDIT_BTN_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { recordCopy } from '@/lib/clipboard-history';
import { buildOpenLinksHubHref } from '@/lib/receiving/listing-links';

export function IdentityLinkChip({
  openHref,
  openTitle,
  value,
  display,
  tone,
  underlineClass,
  iconClass,
  disableCopy,
  onEdit,
  editOpen,
  editLabel,
  grow = false,
  actionsInMenu = false,
  chipAction = 'copy',
  showExternalIcon = false,
  menuFirstAction = 'open',
  menuBetween,
  suppressMenu = false,
  linkOptions,
  iconOnly = false,
  iconOnlyMark,
}: {
  openHref: string | null | undefined;
  openTitle: string;
  /** Raw value copied to the clipboard. */
  value: string;
  /** Label shown in the chip (platform name / last-4 id). Hidden when `iconOnly`. */
  display: string;
  /**
   * Copy-chip tone — supplies the leading identity icon (id `#`, tracking pin,
   * etc.) so PO#/tracking read consistently with the ticket chip. The explicit
   * `underlineClass`/`iconClass` below still win for color.
   */
  tone?: ChipTone;
  underlineClass: string;
  iconClass?: string;
  disableCopy?: boolean;
  /** Toggles the below-row editor for this field. Omit to hide the pencil. */
  onEdit?: () => void;
  editOpen?: boolean;
  editLabel?: string;
  /** Wide chip that fills the remaining row width (listing). Others hug last-4. */
  grow?: boolean;
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
   * Optional row(s) between the first action (Open/Copy) and Edit — e.g. ticket
   * chip seller-message. Caller owns separators / menuitem markup.
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
   * platform name. `display` stays the accessible / tooltip label.
   */
  iconOnly?: boolean;
  /** Mark node (e.g. {@link PlatformMark}) when `iconOnly`. */
  iconOnlyMark?: ReactNode;
}) {
  const [menuHover, setMenuHover] = useState(false);
  const normalizedValue = normalizeCopyText(value);
  const canCopy = !disableCopy && !!normalizedValue && normalizedValue !== '---';
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
      menuFirstAction === 'copy' ||
      !!openHref ||
      multiLinks != null ||
      menuBetween != null);
  const showActionMenu = hasMenuActions && !editOpen && !suppressMenu;
  const isEditing = !!editOpen;

  const iconOnlyTooltip = openHref
    ? `${display} — ${openTitle}`
    : display
      ? `${display} — no link available`
      : 'No listing';

  // While editing, chip face is pulsed "edit"; click closes the below-row field.
  const chipActivate = isEditing
    ? onEdit
    : chipAction === 'open'
      ? openExternal
      : undefined;
  const chipActivateLabel = isEditing
    ? (editLabel ? `Done — ${editLabel}` : 'Done editing')
    : chipAction === 'open'
      ? openTitle
      : undefined;

  return (
    <div
      className={`group relative flex items-center gap-0.5 ${
        iconOnly || !grow ? 'shrink-0' : 'min-w-0 flex-1'
      }`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        if (showActionMenu) setMenuHover(true);
      }}
      onMouseLeave={() => setMenuHover(false)}
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
          <HoverTooltip label={iconOnlyTooltip} asChild>
            {/* ds-raw-button: fixed-width platform mark face — not a DS Button */}
            <button
              type="button"
              onClick={chipActivate ?? copyValue}
              disabled={
                isEditing
                  ? !onEdit
                  : chipAction === 'open'
                    ? !openHref && !onEdit
                    : !canCopy
              }
              aria-label={
                isEditing
                  ? chipActivateLabel
                  : chipAction === 'open'
                    ? `${display}: ${openTitle}`
                    : `Copy ${display}`
              }
              aria-busy={isEditing || undefined}
              className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-hover active:scale-95 disabled:opacity-40${
                isEditing ? ' animate-pulse' : ''
              }`}
            >
              {iconOnlyMark}
            </button>
          </HoverTooltip>
        ) : (
          <CopyChip
            value={value}
            display={display}
            tone={tone}
            editing={isEditing}
            // Tone SoT (# / MapPin / …) wins; ExternalLink is listing-only.
            icon={
              tone
                ? undefined
                : showExternalIcon
                  ? <ExternalLink className="h-4 w-4 shrink-0" />
                  : undefined
            }
            underlineClass={underlineClass}
            iconClass={iconClass}
            width={grow ? 'min-w-0 flex-1 max-w-full' : 'w-auto'}
            outerPad="flush"
            disableCopy={disableCopy || isEditing}
            fitDisplayWidth={!grow}
            truncateDisplay={grow}
            // Hover shows the full value (listing URL / tracking / PO# / ticket#)
            // via the site tooltip above; the Open/Edit action menu still opens
            // below the chip on the same hover.
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
          // menu is not covered/clipped when it opens below the identity chips.
          className={`absolute left-1/2 top-full z-panelPopover -translate-x-1/2 pt-1 transition-opacity duration-100 ${
            menuHover
              ? 'visible pointer-events-auto opacity-100'
              : 'invisible pointer-events-none opacity-0'
          }`}
        >
          <div
            role="menu"
            aria-label={`${display} actions`}
            className="min-w-[128px] overflow-hidden rounded-lg border border-border-soft bg-surface-card shadow-lg"
          >
            {multiLinks ? (
              <>
                {/* ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={openAllLinks}
                  aria-label={`Open all ${display} links`}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-50"
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
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-50"
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-text-faint disabled:opacity-40"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption font-bold uppercase tracking-widest text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                Copy
              </button>
            )}
            {menuBetween}
            {onEdit ? (
              // ds-raw-button: text-left dropdown menuitem row (icon + label), not a standard action button
              <button
                type="button"
                role="menuitem"
                onClick={onEdit}
                aria-expanded={editOpen}
                aria-label={editLabel}
                className="flex w-full items-center gap-2 border-t border-border-hairline px-3 py-1.5 text-left text-role-caption font-bold uppercase tracking-widest text-text-muted hover:bg-surface-hover"
              >
                <Pencil className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                Edit
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default IdentityLinkChip;
