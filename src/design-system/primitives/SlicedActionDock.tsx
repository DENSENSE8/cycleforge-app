'use client';

/** SlicedActionDock — bottom-docked floating terminal CTA (DoorDash/Uber sticky job). */

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { Check, ChevronDown, Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { FLOATING_DOCK_BOTTOM_PAD } from '@/design-system/tokens/dock-clearance';
import {
  COMPOSER_MENU_ITEM_CORNER,
  COMPOSER_SHELL_CORNER,
  cornerClass,
} from '@/design-system/tokens/radius';
import { Popover } from './Popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

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

/**
 * Embedded track chrome — ops square, composer-footer 2xl, or desk-header capsule.
 */
export type SlicedActionEmbeddedChrome = 'flush' | 'pill' | 'header';

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
  /**
   * How the chevron's menu is rendered.
   * track it hangs off. Operator direction (2026-08-31): "no caps lock" — the
   */
  menuChrome?: 'ops' | 'dropdown';
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
  /** When `embedded`, choose track chrome. */
  embeddedChrome?: SlicedActionEmbeddedChrome;
  /** Which way the split menu opens. */
  menuPlacement?: 'top' | 'bottom';
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

/** Segment ink for a tone. */
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
 * Desk page-header split CTA — the same {@link cornerClass}(`'pill'`) token
 * {@link DeskHeaderAction} locks on Button. Flat like the composer-footer
 * track (it sits in the title row, not over the work).
 */
const HEADER_PILL_TRACK = `${cornerClass('pill')} shadow-none ring-1 ring-black/5`;
function isEmbeddedSoftTrack(
  embedded: boolean | undefined,
  chrome: SlicedActionEmbeddedChrome | undefined,
): boolean {
  return Boolean(embedded) && (chrome === 'pill' || chrome === 'header');
}

/**
 * Track chrome for a placement. Pure so a test can assert that a composer
 * pill carries NO drop shadow without rendering React — only the free-floating
 * dock, which genuinely hovers over the work, is allowed to cast one.
 */
export function slicedActionDockTrackClass(opts: {
  embedded?: boolean;
  embeddedChrome?: SlicedActionEmbeddedChrome;
}): string {
  if (opts.embedded && opts.embeddedChrome === 'header') return HEADER_PILL_TRACK;
  const composerPill = Boolean(opts.embedded) && opts.embeddedChrome === 'pill';
  if (composerPill) return COMPOSER_PILL_TRACK;
  const usePillChrome = !opts.embedded || opts.embeddedChrome === 'pill' || opts.embeddedChrome === 'header';
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
  embeddedChrome?: SlicedActionEmbeddedChrome;
}): 'menu,primary' | 'primary,menu' {
  return isEmbeddedSoftTrack(opts.embedded, opts.embeddedChrome) ? 'primary,menu' : 'menu,primary';
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
    : cn(
        // pt-1: hairline above the float — never a second band of air under the
        // mode/ring caption (that used to be pt-2 + 1rem bottom pad).
        'pointer-events-none absolute inset-x-0 bottom-0 z-fab px-4 pt-1 sm:px-6',
        FLOATING_DOCK_BOTTOM_PAD,
      );
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
  menuChrome = 'ops',
  menuPlacement = 'top',
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
  const solidBg = isDisabled ? 'bg-surface-strong' : toneClasses ? toneClasses.bg : TONE_BG_SOLID[tone];
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

  // Embedded flush = Band 1 ops square.
  const headerPill = embedded && embeddedChrome === 'header';
  const composerPill = embedded && embeddedChrome === 'pill';
  const compactPill = composerPill || headerPill;
  const usePillChrome = !embedded || compactPill;
  const trackChrome = slicedActionDockTrackClass({ embedded, embeddedChrome });
  const segmentH = compactPill ? 'h-8' : usePillChrome ? 'h-12' : 'h-11';
  const radiusL = headerPill ? 'rounded-l-full' : usePillChrome ? 'rounded-l-2xl' : 'rounded-none';
  const radiusR = headerPill ? 'rounded-r-full' : usePillChrome ? 'rounded-r-2xl' : 'rounded-none';
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
        compactPill ? 'h-3.5 w-3.5' : 'h-4 w-4',
        'opacity-95 transition-transform duration-150',
        menuOpensFromEnd && menuOpen && 'rotate-180',
      )}
    />
  );

  // The chevron/scan cell's face, shared by both menu chromes.
  const endSegmentClass = cn(
    'flex items-center justify-center bg-transparent outline-none transition-[filter] focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60',
    ink.text,
    ink.focus,
    menuOnEnd ? `border-l ${ink.divider}` : `border-r ${ink.divider}`,
    segmentH,
    menuOnEnd ? radiusR : radiusL,
    compactPill ? 'px-2' : usePillChrome ? 'px-3' : 'px-2',
  );

  const useDropdownChrome = menuChrome === 'dropdown' && menuOpensFromEnd;

  const renderDropdownMenuSegment = () => (
    <div className="relative flex shrink-0 self-stretch">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          {/* ds-raw-button: split-menu chevron; Radix owns haspopup/expanded + dismissal */}
          <button
            type="button"
            aria-label={menuLabel ?? 'More actions'}
            title={menuTitle}
            disabled={loading}
            onClick={(e) => e.stopPropagation()}
            className={endSegmentClass}
          >
            {endGlyph}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={menuPlacement === 'bottom' ? 'bottom' : 'top'}
          align={menuOnEnd ? 'end' : 'start'}
          sideOffset={6}
          aria-label={menuLabel ?? 'More actions'}
          // The panel matches the composer-pill track it hangs off:
          className={cn('min-w-[14rem] p-1', COMPOSER_SHELL_CORNER)}
        >
          {menu!.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={item.disabled}
                title={item.title}
                onSelect={(event) => {
                  if (item.keepOpen) event.preventDefault();
                  item.onClick();
                }}
                // Sentence case at the CTA label's own type role — the menu is
                // the same voice as the button, not station caps.
                className={cn(
                  'gap-2.5 px-3 py-2 text-role-caption',
                  COMPOSER_MENU_ITEM_CORNER,
                  item.selected && 'bg-surface-canvas',
                )}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.selected ? <Check aria-hidden /> : null}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {endSegmentExtra}
    </div>
  );

  const renderOpsMenuSegment = () => (
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
        className={endSegmentClass}
      >
        {endGlyph}
      </button>
      {endSegmentExtra}
      <Popover
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={menuTriggerRef}
        placement={
          menuPlacement === 'bottom'
            ? (menuOpensFromEnd && menuOnEnd ? 'bottom-end' : 'bottom-start')
            : (menuOpensFromEnd && menuOnEnd ? 'top-end' : 'top-start')
        }
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
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-role-caption font-semibold transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-35',
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
  );

  // Built lazily: both branches dereference `menu`, which is absent on a
  // single-segment dock.
  const menuSegment = !hasMenu
    ? null
    : useDropdownChrome
      ? renderDropdownMenuSegment()
      : renderOpsMenuSegment();

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
        compactPill ? 'px-3 text-role-caption' : usePillChrome ? 'px-5' : 'px-3.5',
        fullWidth
          ? 'flex-1'
          : compactPill
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
            isDisabled
              ? 'cursor-not-allowed'
              : 'hover:brightness-[0.96] active:brightness-[0.92]',
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
