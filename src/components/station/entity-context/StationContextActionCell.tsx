'use client';

/**
 * Carton-bar action faces — geometry by construction.
 *
 * Listing / overflow / claim on the one-row strip go through these cells.
 * Height is `h-full` on the chrome class. Callers cannot pass `className`
 * or swap in IconButton. Photos stay on ReceivingPhotoButton appearance=chrome.
 */
import { forwardRef, useRef, type CSSProperties, type ReactNode } from 'react';
import { Copy, ExternalLink, History, Pencil, Ticket } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ChipHoverMenuSurface } from '@/components/ui/ChipHoverMenuSurface';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import { lifecycleMenuRows, listingMenuRows } from './carton-bar-menu-rows';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  STATION_CHROME_CELL_CLASS,
  STATION_CHROME_CELL_LABEL,
  STATION_CHROME_CELL_PAD,
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

/** Row glyphs for the lifecycle verbs — same 3.5 box as every other menu. */
const LIFECYCLE_MENU_ICONS = {
  history: <History className="h-3.5 w-3.5" />,
  copy: <Copy className="h-3.5 w-3.5" />,
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

/**
 * Lifecycle status cell — the carton's coarse stage, with a hover panel.
 *
 * Face: the stage's own dot, ALONE. No word, at any width.
 *
 * This reverses the 2026-08 ruling that put the name back (see the call site's
 * note). That ruling was right about the mark it replaced — a bare 8px dot
 * wedged between the back chevron and the order #, where the eye reads
 * navigation — but it fixed the wrong half. The dot's problem was its
 * PLACEMENT, not its wordlessness, and moving it to the end of the identity run
 * is what actually solved it. Carrying the word along too spent ~70px of a
 * strip that is under constant width pressure restating what the operator at
 * this bench already knows: a carton on the Unbox bar is Received.
 *
 * The name is not lost, it is demoted: `aria-label` carries `Status: {label}`
 * so assistive tech reads the state outright, and the hover panel names it for
 * anyone who wants it. What a sighted operator who cannot separate the stage
 * hues loses is the at-a-glance read — that is the real cost of this change,
 * and it is the reason the accessible name and the panel both have to stay.
 *
 * The panel is {@link ChipHoverMenuSurface} on {@link useHoverSurface} — the
 * one mechanism and one anchoring every carton-bar menu uses. Its rows come
 * from {@link lifecycleMenuRows}, whose docblock records why Receive /
 * Unreceive and a stage picker are deliberately NOT on it.
 *
 * The panel never repeats the stage name — the face beneath the pointer is
 * already showing it. Its head is the one thing the face cannot hold: the sync
 * sentence for a stage that is locally done but not yet confirmed by the
 * inventory provider (`getReceivingStatusDotTip`), and only when there is one.
 * That sentence plus the route to the evidence is why this cell earns a panel
 * rather than a tooltip.
 */
export function StationContextLifecycleCell({
  label,
  dotClass,
  tip,
  onOpenHistory,
}: {
  /** Never painted. Carries the accessible name and the panel's verbs. */
  label: string;
  dotClass: string;
  /** Provider-sync sentence for the awaiting-confirmation stage, if any. */
  tip?: string | null;
  onOpenHistory?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hover = useHoverSurface({});

  /**
   * The head carries ONLY what the face cannot: the provider-sync sentence.
   *
   * It opened with the stage dot + name — which is the cell the pointer is
   * already resting on. A panel that repeats its own trigger spends its first
   * row saying nothing, and pushes the one line the operator came for down
   * below it. No tip, no head.
   */
  const header = tip ? (
    <div
      className={`max-w-56 px-1.5 py-1.5 text-text-soft ${STATION_CHROME_CELL_LABEL}`}
      data-testid="carton-context-lifecycle-facts"
    >
      {tip}
    </div>
  ) : null;

  const menuRows = lifecycleMenuRows({
    label,
    onOpenHistory,
    onDone: hover.close,
    icons: LIFECYCLE_MENU_ICONS,
    header,
  });

  return (
    <div
      ref={hostRef}
      className="relative flex h-full shrink-0 items-stretch"
      onClick={(e) => e.stopPropagation()}
      {...hover.triggerProps}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={hover.isOpen}
        aria-label={tip ? `Status: ${label} — ${tip}` : `Status: ${label}`}
        className={cn(
          'ds-raw-button outline-none',
          focusRing('control', 'accent'),
          STATION_CHROME_CELL_CLASS,
          STATION_CHROME_CELL_PAD,
        )}
        data-testid="carton-context-lifecycle"
        data-face="dot"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} aria-hidden />
      </button>
      <ChipHoverMenuSurface
        open={hover.isOpen}
        onClose={hover.close}
        anchorRef={hostRef}
        menuLabel="Status"
        rows={menuRows}
        surfaceProps={hover.surfaceProps}
      />
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
