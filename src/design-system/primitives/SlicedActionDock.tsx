'use client';

/**
 * SlicedActionDock — bottom-docked floating terminal CTA (DoorDash/Uber sticky job).
 *
 * Fully rounded pill track (`rounded-2xl` on all corners). Optional menu/primary
 * segments share one tone track with a hairline between:
 *   flush / float — [ ▾ menu ]|[ primary CTA ]
 *   composer pill  — [ primary CTA ]|[ ▾ menu ]  (chevron farthest right)
 *   composer pill + menuAnchor=primary — [ face (opens menu) ]|[ scan ]
 *
 * Placement:
 *   - `bottom` (default) — absolute float at host bottom
 *   - `bottom` + `docked` — in-flow band under other docked bands (receive feedback)
 *   - `embedded` — bare flush-square track inside another control's chrome
 *     (Unbox Band 1 trailing Print · Receive). Ops chrome — never a soft pill.
 *
 * Host must be `position: relative` + full-height; scroll body reserves
 * {@link STATION_TERMINAL_SCROLL_CLEARANCE} (`pb-32`) when absolute.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { Check, ChevronDown, Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { Popover } from './Popover';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SlicedActionTone =
  | 'accent'
  | 'surface'
  | 'blue'
  | 'emerald'
  | 'orange'
  | 'violet'
  | 'red'
  | 'gray';

export interface SlicedActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Marks the active choice (e.g. selected label kind). */
  selected?: boolean;
  /** Quiet rule above this item — group outcomes below selections. */
  separatorBefore?: boolean;
  /** Keep the menu open after click (selection toggles). Default closes. */
  keepOpen?: boolean;
}

/** Canvas edge the dock slices against. Extend when a new region needs a slice. */
export type SlicedActionEdge = 'bottom';

export interface SlicedActionDockProps {
  /** CTA label. */
  label: string;
  /** Primary click handler. */
  onClick: () => void;
  /** Leading icon node. */
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** Title attribute for the CTA (explains disabled states). */
  title?: string;
  /** Tone preset. Ignored when `toneClasses` is set. Defaults to `accent`. */
  tone?: SlicedActionTone;
  /** Override the tone with arbitrary Tailwind classes (e.g. a per-row theme). */
  toneClasses?: { bg: string; hover: string };
  /** Optional split — menu chevron + primary CTA (order from {@link slicedActionDockSegmentOrder}). */
  menu?: SlicedActionMenuItem[];
  /**
   * Which segment opens `menu`. Default `end` (Print chevron). Location
   * uses `primary` so the far-right slice can arm a HID scan cell.
   */
  menuAnchor?: 'end' | 'primary';
  /** End-segment glyph. Default chevron; Location passes a QR mark. */
  menuIcon?: ReactNode;
  /** End-segment click when {@link menuAnchor} is `primary` (scan arm). */
  onEndClick?: () => void;
  /** aria-label for the end segment when it is not the menu trigger. */
  endAriaLabel?: string;
  /** Overlay inside the end segment (armed HID scan input). */
  endSegmentExtra?: ReactNode;
  /** aria-label for the chevron trigger. Defaults to "More actions". */
  menuLabel?: string;
  /** title attribute for the chevron trigger. */
  menuTitle?: string;
  /** Max width of the centered track. Match the host column. */
  maxWidth?: string;
  /** Stretch the track to fill `maxWidth`. Default `false`. */
  fullWidth?: boolean;
  /**
   * In-flow docked band instead of absolute bottom float. Use when other bands
   * (receive feedback, label preview) stack above the terminal CTA.
   */
  docked?: boolean;
  /**
   * Render ONLY the track — no dock band, no centering column, no
   * safe-area padding. For mounting the CTA inside another control's chrome
   * (composer footer · Arrival/Testing Band 1).
   */
  embedded?: boolean;
  /**
   * When `embedded`, choose track chrome. `flush` (default) = ops square.
   * `pill` = rounded-2xl divided track for the Omnichannel composer footer.
   */
  embeddedChrome?: 'flush' | 'pill';
  /** Dock placement. Default `bottom`. */
  edge?: SlicedActionEdge;
  /**
   * Horizontal alignment of the pill within `maxWidth`.
   * Use `end` for compact bottom-right CTAs (Unbox overview with composer).
   */
  align?: 'center' | 'end';
  /** Extra class on the outer wrapper. */
  className?: string;
}

const TONE_BG_SOLID: Record<SlicedActionTone, string> = {
  accent: operatorAccentClasses.bg,
  surface: 'bg-surface-card',
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-600',
  orange: 'bg-orange-600',
  violet: 'bg-violet-700',
  red: 'bg-rose-600',
  gray: 'bg-surface-inverse',
};

/**
 * Segment ink for a tone.
 *
 * Every solid tone paints white-on-color; `surface` is the one QUIET track —
 * a white fill with ink text, for a second pill sitting beside an accent
 * primary (Unbox notes footer: Print owns accent, Location must not shout a
 * second green CTA). It is a TONE rather than a `className` hue override so
 * the ring, the divider, and the focus ring stay coherent with the track —
 * a `className` fill would leave a white-on-white label and a white divider.
 *
 * Pure so the ratchet test can assert the quiet track without rendering React.
 */
export function slicedActionDockToneInk(tone: SlicedActionTone): {
  text: string;
  divider: string;
  ring: string;
  focus: string;
} {
  if (tone === 'surface') {
    return {
      text: 'text-text-default',
      divider: 'border-border-soft',
      ring: 'ring-1 ring-border-soft',
      focus: 'focus-visible:ring-accent-solid/70',
    };
  }
  return {
    text: 'text-white',
    divider: 'border-white/20',
    ring: '',
    focus: 'focus-visible:ring-white/70',
  };
}

/** Fully rounded floating pill chrome (all four corners). */
const PILL_TRACK = 'rounded-2xl shadow-lg shadow-black/15 ring-1 ring-black/5';
/**
 * Embedded ops chrome — flush-square (Unbox Band 1 / Testing / Arrival).
 * Soft `rounded-xl` + drop shadow on an embedded station floor is banned debt.
 */
const EMBEDDED_TRACK = 'rounded-none shadow-none ring-0';
/**
 * Composer-footer pill — rounded like a floating dock but FLAT. It sits inside
 * the notes composer's own raised bubble, so a drop shadow would paint a second
 * elevated plane stacked on the first; the hairline ring alone separates it.
 */
const COMPOSER_PILL_TRACK = 'rounded-2xl shadow-none ring-1 ring-black/5';

/**
 * Track chrome for a placement. Pure so a test can assert that a composer
 * pill carries NO drop shadow without rendering React — only the free-floating
 * dock, which genuinely hovers over the work, is allowed to cast one.
 */
export function slicedActionDockTrackClass(opts: {
  embedded?: boolean;
  embeddedChrome?: 'flush' | 'pill';
}): string {
  const composerPill = Boolean(opts.embedded) && opts.embeddedChrome === 'pill';
  if (composerPill) return COMPOSER_PILL_TRACK;
  const usePillChrome = !opts.embedded || opts.embeddedChrome === 'pill';
  return usePillChrome ? PILL_TRACK : EMBEDDED_TRACK;
}

const spring = { type: 'spring', stiffness: 520, damping: 36 } as const;

/**
 * Outer band class for a dock placement. Pure so the ratchet/unit tests can
 * assert that `embedded` carries no dock padding without rendering React.
 */
/**
 * Split-track segment order. Composer-footer pills put the chevron on the
 * far right so Print label leads; flush/floating docks keep the historic
 * left-chevron DoorDash split.
 */
export function slicedActionDockSegmentOrder(opts: {
  embedded?: boolean;
  embeddedChrome?: 'flush' | 'pill';
}): 'menu,primary' | 'primary,menu' {
  return opts.embedded && opts.embeddedChrome === 'pill'
    ? 'primary,menu'
    : 'menu,primary';
}

export function slicedActionDockWrapperClass(opts: {
  edge?: SlicedActionEdge;
  docked?: boolean;
  embedded?: boolean;
}): string {
  // Embedded lives inside another control's chrome — it owns no band geometry.
  if (opts.embedded) return '';
  // Only `bottom` exists today — keep the switch so new edges stay explicit.
  if ((opts.edge ?? 'bottom') !== 'bottom') return '';
  return opts.docked
    ? 'shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6'
    : 'pointer-events-none absolute inset-x-0 bottom-0 z-fab px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SlicedActionDock({
  label,
  onClick,
  icon,
  disabled = false,
  loading = false,
  title,
  tone = 'accent',
  toneClasses,
  menu,
  menuAnchor = 'end',
  menuIcon,
  onEndClick,
  endAriaLabel,
  endSegmentExtra,
  menuLabel,
  menuTitle,
  maxWidth = 'max-w-[720px]',
  fullWidth = false,
  docked = false,
  embedded = false,
  embeddedChrome = 'flush',
  edge = 'bottom',
  align = 'center',
  className,
}: SlicedActionDockProps) {
  const isDisabled = disabled || loading;
  const solidBg = isDisabled
    ? 'bg-surface-strong'
    : toneClasses
      ? toneClasses.bg
      : TONE_BG_SOLID[tone];
  const hasMenu = Array.isArray(menu) && menu.length > 0;
  // A per-row `toneClasses` override is always a COLOR track (staff accent),
  // so it keeps the white ink; only the declared `surface` tone goes quiet.
  const ink = slicedActionDockToneInk(toneClasses ? 'accent' : tone);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuListId = useId();

  useEffect(() => {
    if (loading) setMenuOpen(false);
  }, [loading]);

  const leadingIcon = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon;
  const closeMenu = () => setMenuOpen(false);

  const wrapperClass = slicedActionDockWrapperClass({ edge, docked, embedded });

  // Embedded flush = Band 1 ops square. Embedded pill = composer-footer bubble
  // (compact h-8 so + / recent / sync sit on one tight bottom row). Floating
  // bottom docks keep the 48px HIG track.
  const usePillChrome = !embedded || embeddedChrome === 'pill';
  const composerPill = embedded && embeddedChrome === 'pill';
  const trackChrome = slicedActionDockTrackClass({ embedded, embeddedChrome });
  const segmentH = composerPill ? 'h-8' : usePillChrome ? 'h-12' : 'h-11';
  const radiusL = usePillChrome ? 'rounded-l-2xl' : 'rounded-none';
  const radiusR = usePillChrome ? 'rounded-r-2xl' : 'rounded-none';
  const dataEmbeddedChrome = embedded ? embeddedChrome : undefined;
  const segmentOrder = slicedActionDockSegmentOrder({
    embedded,
    embeddedChrome,
  });
  const menuOnEnd = segmentOrder === 'primary,menu';
  const menuOpensFromEnd = menuAnchor === 'end';
  const endGlyph = menuIcon ?? (
    <ChevronDown
      className={cn(
        composerPill ? 'h-3.5 w-3.5' : 'h-4 w-4',
        'opacity-95 transition-transform duration-150',
        menuOpensFromEnd && menuOpen && 'rotate-180',
      )}
    />
  );

  const menuSegment = hasMenu ? (
    <div className="relative flex shrink-0 self-stretch">
      {/* ds-raw-button: split-menu chevron or scan-end cell; Popover owns dismissal */}
      <button
        ref={menuOpensFromEnd ? menuTriggerRef : undefined}
        type="button"
        aria-haspopup={menuOpensFromEnd ? 'menu' : undefined}
        aria-expanded={menuOpensFromEnd ? menuOpen : undefined}
        aria-controls={menuOpensFromEnd && menuOpen ? menuListId : undefined}
        aria-label={
          menuOpensFromEnd
            ? (menuLabel ?? 'More actions')
            : (endAriaLabel ?? menuLabel ?? 'Scan')
        }
        title={menuOpensFromEnd ? menuTitle : endAriaLabel}
        disabled={menuOpensFromEnd ? loading : isDisabled}
        onClick={(e) => {
          e.stopPropagation();
          if (menuOpensFromEnd) {
            setMenuOpen((open) => !open);
            return;
          }
          onEndClick?.();
        }}
        className={cn(
          'flex items-center justify-center bg-transparent outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60',
          ink.text,
          ink.focus,
          menuOnEnd ? `border-l ${ink.divider}` : `border-r ${ink.divider}`,
          segmentH,
          menuOnEnd ? radiusR : radiusL,
          composerPill ? 'px-2' : usePillChrome ? 'px-3' : 'px-2',
        )}
      >
        {endGlyph}
      </button>
      {endSegmentExtra}
      <Popover
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={menuTriggerRef}
        placement={menuOpensFromEnd && menuOnEnd ? 'top-end' : 'top-start'}
        gap={6}
        padded={false}
        role="menu"
        id={menuListId}
        aria-label={menuLabel ?? 'More actions'}
        className="min-w-[14rem] py-1 shadow-xl ring-1 ring-border-soft/80"
      >
        {menu!.map((item) => (
          <div key={item.label} role="none">
            {item.separatorBefore ? (
              <div
                role="separator"
                className="my-1 border-t border-border-hairline"
              />
            ) : null}
            {/* ds-raw-button: menu item inside Popover role=menu */}
            <button
              role="menuitem"
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                item.onClick();
                if (!item.keepOpen) closeMenu();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-role-caption font-semibold uppercase tracking-wider transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35',
                item.selected ? 'bg-surface-hover text-text-default' : 'text-text-default',
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.selected ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-text-default" aria-hidden />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
            </button>
          </div>
        ))}
      </Popover>
    </div>
  ) : null;

  const primarySegment = hasMenu ? (
    <button
      ref={menuOpensFromEnd ? undefined : menuTriggerRef}
      type="button"
      aria-haspopup={menuOpensFromEnd ? undefined : 'menu'}
      aria-expanded={menuOpensFromEnd ? undefined : menuOpen}
      aria-controls={!menuOpensFromEnd && menuOpen ? menuListId : undefined}
      onClick={() => {
        if (menuOpensFromEnd) {
          onClick();
          return;
        }
        setMenuOpen((open) => !open);
      }}
      disabled={isDisabled}
      title={title}
      className={cn(
        'inline-flex min-w-0 items-center justify-center gap-2 bg-transparent text-sm font-semibold outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60',
        ink.text,
        ink.focus,
        segmentH,
        menuOnEnd ? radiusL : radiusR,
        composerPill ? 'px-3 text-role-caption' : usePillChrome ? 'px-5' : 'px-3.5',
        fullWidth
          ? 'flex-1'
          : composerPill
            ? 'min-w-[5.5rem]'
            : usePillChrome
              ? 'min-w-[9rem]'
              : '',
      )}
    >
      {leadingIcon}
      <span className="truncate">{label}</span>
    </button>
  ) : null;

  const track = (
    <>
      {hasMenu ? (
        <motion.div
          whileTap={isDisabled ? undefined : { scale: 0.99 }}
          transition={spring}
          className={cn(
            'relative z-20 flex min-w-0 overflow-visible transition-[filter] duration-100',
            trackChrome,
            ink.ring,
            isDisabled ? 'cursor-not-allowed' : 'hover:brightness-[0.96] active:brightness-[0.92]',
            solidBg,
            fullWidth ? 'w-full' : 'w-auto max-w-full',
            embedded && className,
          )}
          data-testid="sliced-action-dock"
          data-edge={edge}
          data-align={align}
          data-embedded={embedded ? 'true' : undefined}
          data-embedded-chrome={dataEmbeddedChrome}
          data-segments={segmentOrder}
          data-menu-anchor={menuAnchor}
          data-tone={toneClasses ? undefined : tone}
        >
          {menuOnEnd ? (
            <>
              {primarySegment}
              {menuSegment}
            </>
          ) : (
            <>
              {menuSegment}
              {primarySegment}
            </>
          )}
        </motion.div>
      ) : (
        <motion.button
          type="button"
          onClick={onClick}
          disabled={isDisabled}
          title={title}
          whileTap={isDisabled ? undefined : { scale: 0.99 }}
          transition={spring}
          data-testid="sliced-action-dock"
          data-edge={edge}
          data-align={align}
          data-embedded={embedded ? 'true' : undefined}
          data-embedded-chrome={dataEmbeddedChrome}
          data-segments="primary"
          className={cn(
            'inline-flex items-center justify-center gap-2.5 text-sm font-semibold outline-none transition-[filter] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
            ink.text,
            ink.focus,
            segmentH,
            usePillChrome ? 'px-6' : 'px-4',
            trackChrome,
            ink.ring,
            isDisabled ? '' : 'hover:brightness-[0.96] active:brightness-[0.92]',
            solidBg,
            fullWidth ? 'w-full min-w-0' : 'w-auto max-w-full',
            embedded && className,
          )}
        >
          {leadingIcon}
          <span className="truncate">{label}</span>
        </motion.button>
      )}
    </>
  );

  // Embedded owns no band geometry — the host control places the track.
  if (embedded) return track;

  return (
    <div className={cn(wrapperClass, className)}>
      <div
        className={cn(
          'mx-auto flex w-full',
          docked ? '' : 'pointer-events-auto',
          maxWidth,
          fullWidth ? '' : align === 'end' ? 'justify-end' : 'justify-center',
        )}
      >
        {track}
      </div>
    </div>
  );
}
