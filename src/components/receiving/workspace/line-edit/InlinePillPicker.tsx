'use client';

/** Collapse-to-active pill selector. */

import { useEffect, useRef, type ReactNode } from 'react';
import { chipLabel } from '@/design-system/tokens/typography/presets';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { Pencil } from '@/components/Icons';
import { HEADER_ICON_WRAP } from '@/components/layout/header-shell';
import {
  STATION_CHROME_CELL_CLASS_MARK,
} from '@/components/station/entity-context/station-identity-chrome';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { motionBezier, framerDuration } from '@/design-system/foundations/motion-framer';
import { cn } from '@/utils/_cn';
import {
  ChipHoverMenuSurface,
  type ChipHoverMenuRow,
} from '@/components/ui/ChipHoverMenuSurface';

export interface InlinePillOption {
  value: string;
  label: string;
  /**
   * Dense carton-bookmark label (platform mark / type short / urgency short).
   * Used when `collapsedVariant="bookmark"`.
   */
  shortLabel?: string;
  /** Active tone classes (default: blue). */
  activeClass?: string;
  /** Inactive tone classes (default: gray). */
  inactiveClass?: string;
  /**
   * Inline styles for hex-driven platform faces (soft fill + ink from
   * {@link platformPaintFromHex}). Applied with {@link activeClass}.
   */
  activeStyle?: import('react').CSSProperties;
  /** Inline styles for idle hex-driven faces. */
  inactiveStyle?: import('react').CSSProperties;
  title?: string;
  /**
   * Identity face (platform mark / type glyph / urgency flag). Used when
   * `collapsedFace` or `expandedFace` is `"icon"` / `"iconLabel"`.
   */
  face?: ReactNode;
  /** Colored identity dot. Color lives here only — never on the label text. */
  dotClass?: string;
  dotStyle?: import('react').CSSProperties;
}

/** Carton-context flush face — square corners; fills station chrome row (h-full). */
/** **Geometry only — no chrome.** These faces carry size, pitch and type; the border and the hover box belong to the PRESENTATION, and are… */
const PILL_BASE =
  `inline-flex box-border h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none px-1.5 ${chipLabel} transition-colors shadow-none`;
/**
 * Locked equal-width icon-only faces — square peer of carton exit
 * ({@link STATION_CONTEXT_EXIT_PILL_CLASS}); height from the chrome row.
 */
const INLINE_PILL_ICON_FACE =
  'inline-flex box-border h-full aspect-square shrink-0 items-center justify-center rounded-none transition-colors shadow-none';
/** Icon + full name — expanded option pads / default collapsed. */
const INLINE_PILL_ICON_LABEL =
  `inline-flex box-border h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none pl-1.5 pr-2.5 ${chipLabel} transition-colors shadow-none`;
/** Carton bookmark — equal-width quiet shell. */
const INLINE_PILL_ICON_LABEL_BOOKMARK =
  `inline-flex box-border h-full w-16 min-w-16 max-w-16 shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-none px-1 ${chipLabel} transition-colors shadow-none`;

const DEFAULT_ACTIVE = 'border-blue-200 bg-blue-50 text-blue-700 shadow-none';
const DEFAULT_INACTIVE =
  'border-border-soft bg-surface-card/70 text-text-muted hover:border-border-default hover:bg-surface-hover';

const EMPTY_FACE = (
  <span className="text-current" aria-hidden>
    —
  </span>
);

const IDENTITY_PILL =
  'border-border-soft bg-surface-card text-text-default shadow-none';

/** Dot color from explicit option fields, else the face tone map. */
function resolveOptionDot(opt: InlinePillOption | null): {
  className: string;
  style?: import('react').CSSProperties;
} {
  if (!opt) return { className: 'bg-border-emphasis' };
  if (opt.dotStyle) return { className: opt.dotClass ?? '', style: opt.dotStyle };
  if (opt.dotClass) return { className: opt.dotClass };
  const text = (opt.activeClass ?? '')
    .split(/\s+/)
    .find(
      (token) =>
        token.startsWith('text-') &&
        !token.startsWith('text-text') &&
        !token.startsWith('text-text-default') &&
        !token.startsWith('text-white'),
    );
  if (text) return { className: text.replace(/^text-/, 'bg-') };
  return { className: 'bg-border-emphasis' };
}

function IdentityDot({ opt }: { opt: InlinePillOption | null }) {
  const dot = resolveOptionDot(opt);
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', dot.className)}
      style={dot.style}
      aria-hidden
    />
  );
}

const SWAP_MS = 0.12;
const OPTION_STAGGER_MS = 0.018;

interface InlinePillMenuLeadItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export function InlinePillPicker({
  ariaLabel,
  options,
  value,
  onSelect,
  open,
  onOpenChange,
  disabled = false,
  readOnly = false,
  placeholder = '—',
  collapsedLabel,
  collapsedFullLabel,
  collapsedClass,
  leadingIcon,
  collapsedFace = 'label',
  expandedFace = 'label',
  collapsedVariant = 'default',
  presentation = 'inline',
  onEditCatalog,
  editCatalogLabel = 'Edit',
  menuLeadItems = [],
}: {
  ariaLabel: string;
  options: InlinePillOption[];
  value: string;
  onSelect: (next: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /**
   * Facts-only display — collapsed face, no open, no dim (unlike `disabled`).
   */
  readOnly?: boolean;
  placeholder?: string;
  /** Collapsed visible label (bookmark: short SoT string). */
  collapsedLabel?: string;
  /**
   * Full teaching name for aria / HoverTooltip when the visible face is short
   * (e.g. urgency Auto mode still reads "High").
   */
  collapsedFullLabel?: string;
  collapsedClass?: string;
  /** Quiet dimension eyebrow on expanded label rows only. */
  leadingIcon?: ReactNode;
  /**
   * `label` — text pill (variable width by copy).
   * `icon` — locked `h-8 w-8` identity face.
   * `iconLabel` — identity face + name (banner / options).
   */
  collapsedFace?: 'label' | 'icon' | 'iconLabel' | 'dot';
  /** How expanded options render (inline presentation). */
  expandedFace?: 'label' | 'icon' | 'iconLabel';
  /**
   * `bookmark` — equal-width quiet icon+shortLabel shell + HoverTooltip full name.
   * CartonContextCard classify strip only.
   */
  collapsedVariant?: 'default' | 'bookmark';
  /**
   * `menu` — chip-anchored hover list (carton-context). Optional lead rows
   * (Add platform / Edit all) sit above the option list. `inline` — in-row strip.
   */
  presentation?: 'inline' | 'menu';
  /** Trailing catalog escape on the `menu` panel — a hairline, then one row that opens the org catalog manager where this dimension's colours… */
  /** Opens the org catalog manager for this pill's kind. */
  onEditCatalog?: () => void;
  editCatalogLabel?: string;
  /** Hover-menu rows above the option list (catalog add / edit-all). */
  menuLeadItems?: InlinePillMenuLeadItem[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const isBookmark = collapsedVariant === 'bookmark';
  const isMenu = presentation === 'menu';

  useEffect(() => {
    if (!open || readOnly || isMenu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, readOnly, isMenu]);

  /** Hover-to-open comes from {@link useHoverSurface} — the ONE engine, shared with the rail peek and the chip menus (0ms open, 150ms close,… */
  const hover = useHoverSurface({
    disabled: readOnly || disabled || !isMenu,
    onOpenChange: (next) => onOpenChange(next),
  });

  /**
   * The menu's actual open state. Menus read the registry (the owner); every
   * other presentation keeps using the lifted prop, which it alone owns.
   */
  const menuOpen = isMenu ? hover.isOpen : open;

  /**
   * A close request (Escape, outside click, item select) must reach the
   * OWNER, or the registry keeps the slot and the menu never reopens. The
   * parent is still notified so the bar can unfreeze its layout.
   */
  const onMenuOpenChange = (next: boolean) => {
    if (!next) hover.close();
    onOpenChange(next);
  };

  const valueKey = String(value ?? '').trim().toLowerCase();
  const active =
    options.find((o) => o.value === value) ??
    (valueKey
      ? (options.find((o) => String(o.value).trim().toLowerCase() === valueKey) ?? null)
      : null);
  const showOpen = open && !readOnly && !isMenu;
  const fullLabel =
    collapsedFullLabel ?? active?.label ?? collapsedLabel ?? placeholder;
  const faceLabel = isBookmark
    ? (collapsedLabel ?? active?.shortLabel ?? active?.label ?? placeholder)
    : (collapsedLabel ?? active?.label ?? placeholder);
  const faceTone = IDENTITY_PILL;
  const faceStyle = undefined;
  const identityFace = active?.face ?? EMPTY_FACE;
  /**
   * Identity only — never an instruction. The face used to append
   * "— click to change", which was both wrong (it opens on hover now) and
   * chrome narrating itself. The menu IS the affordance.
   */
  const tooltipLabel = `${ariaLabel}: ${active?.title ?? fullLabel}`;

  const swapTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: SWAP_MS, ease: motionBezier.easeOut };
  const optionTransition = (i: number) =>
    reduceMotion
      ? { duration: 0.01 }
      : {
          duration: framerDuration.chipCopyFeedback,
          delay: i * OPTION_STAGGER_MS,
          ease: motionBezier.easeOut,
        };

  const collapsedShell =
    collapsedFace === 'icon' || collapsedFace === 'dot'
      ? INLINE_PILL_ICON_FACE
      : collapsedFace === 'iconLabel'
        ? isBookmark
          ? INLINE_PILL_ICON_LABEL_BOOKMARK
          : INLINE_PILL_ICON_LABEL
        : PILL_BASE;

  const collapsedClassName = cn(
    collapsedShell,
    faceTone,
    // Flat face — classify pills match Photos · Claim (`shadow-none`), even if a
    // tone SoT regresses to `shadow-sm`.
    'shadow-none',
    // Stacking is the row rule's job now (`.cf-chrome-row .cf-chrome-cell`), which pins every cell to one layer so none can lift above the seam.
    'focus-visible:z-raised',
    focusRing('control', 'accent'),
    // Off the carton bar the face is its own boxed control and draws a border.
    !isMenu && 'border',
    // On the bar it is a CELL:
    isMenu && `bg-transparent ${STATION_CHROME_CELL_CLASS_MARK}`,
    readOnly && 'pointer-events-none',
  );

  const collapsedFaceNode =
    collapsedFace === 'icon' ? (
      <span className="grid place-items-center" aria-hidden>
        {identityFace}
      </span>
      ) : collapsedFace === 'dot' ? (
      <IdentityDot opt={active} />
      ) : collapsedFace === 'iconLabel' ? (
        <>
          <span className="grid h-4 w-4 shrink-0 place-items-center overflow-hidden" aria-hidden>
            {identityFace}
          </span>
          <span
            className={cn(
              isBookmark && 'min-w-0 truncate text-left leading-none opacity-80',
            )}
          >
            {faceLabel}
          </span>
        </>
      ) : (
        <>
          <IdentityDot opt={active} />
          <span className="text-text-default">{faceLabel}</span>
        </>
      );

  const collapsedButton = (
    <button
      type="button"
      aria-haspopup={readOnly ? undefined : 'menu'}
      aria-expanded={readOnly ? undefined : menuOpen}
      aria-label={`${ariaLabel}: ${fullLabel}`}
      // No native `title` on the menu face either — a browser tooltip appearing
      // under the pointer is a second overlay competing with the menu the hover
      // just opened, and it re-fires the wrapper's mouseleave.
      title={isBookmark || isMenu ? undefined : tooltipLabel}
      onClick={readOnly || isMenu ? undefined : () => onOpenChange(true)}
      className={collapsedClassName}
      style={faceStyle}
    >
      {collapsedFaceNode}
    </button>
  );

  const collapsedFaceWrap = isBookmark ? (
    <HoverTooltip label={tooltipLabel} asChild>
      {collapsedButton}
    </HoverTooltip>
  ) : (
    collapsedButton
  );

  if (isMenu) {
    /** NO `HoverTooltip` on a hover-opened trigger. */

    /** ONE panel for the whole carton bar. */
    const selectAndClose = (next: string) => {
      onSelect(next);
      onMenuOpenChange(false);
    };
    const menuRows: ChipHoverMenuRow[] = [
      ...menuLeadItems.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        onSelect: () => {
          item.onSelect();
          onMenuOpenChange(false);
        },
      })),
      ...options.map((opt) => ({
        id: opt.value || '__none__',
        label: opt.label,
        // Dot rides the SAME 3.5 icon box every other carton-bar menu uses for
        // its glyph. `rawIcon` keeps the identity colour the row is showing.
        icon: <IdentityDot opt={opt} />,
        rawIcon: true,
        active: opt.value === value,
        ariaLabel: opt.title ?? opt.label,
        onSelect: () => selectAndClose(opt.value),
      })),
      ...(onEditCatalog
        ? [
            {
              id: '__edit-catalog__',
              label: editCatalogLabel,
              icon: <Pencil className="h-3.5 w-3.5" />,
              // A footer, not a second panel — the SAME seam the option rows
              // use, never a heavier rule.
              seam: true,
              onSelect: () => {
                onEditCatalog();
                onMenuOpenChange(false);
              },
              'data-testid': 'inline-pill-edit-catalog',
            } satisfies ChipHoverMenuRow,
          ]
        : []),
    ];

    return (
      <div
        ref={ref}
        data-inline-pill=""
        data-presentation="menu"
        {...(readOnly ? {} : hover.triggerProps)}
        className={cn(
          'relative flex h-full shrink-0 self-stretch items-stretch',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {readOnly ? (
          <div className="flex h-full shrink-0 items-stretch">{collapsedFaceWrap}</div>
        ) : (
          <>
            {collapsedButton}
            <ChipHoverMenuSurface
              open={menuOpen}
              onClose={() => onMenuOpenChange(false)}
              anchorRef={ref}
              menuLabel={ariaLabel}
              rows={menuRows}
              surfaceProps={hover.surfaceProps}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-inline-pill=""
      data-presentation="inline"
      className={cn(
        // Collapsed: stretch to chrome row so `h-full` on the face is real
        // (a content-sized wrap made urgency · platform · type shorter than Exit).
        'flex',
        showOpen ? 'min-w-0 flex-1 items-center' : 'h-full shrink-0 self-stretch items-stretch',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {/* sync (not wait): overlapping opacity avoids an empty-frame jump */}
      <AnimatePresence initial={false}>
        {showOpen ? (
          <motion.div
            key="expanded"
            role="radiogroup"
            aria-label={ariaLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={swapTransition}
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            {leadingIcon != null && expandedFace === 'label' ? (
              <span className={cn(HEADER_ICON_WRAP, 'text-text-faint')} aria-hidden>
                {leadingIcon}
              </span>
            ) : null}
            <div
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1.5',
                expandedFace === 'icon'
                  ? 'flex-wrap'
                  : 'flex-nowrap overflow-x-auto scrollbar-hide',
              )}
            >
              {options.map((opt, i) => {
                const isActive = opt.value === value;
                const tone = isActive
                  ? opt.activeClass ?? DEFAULT_ACTIVE
                  : opt.inactiveClass ?? DEFAULT_INACTIVE;
                const toneStyle = isActive ? opt.activeStyle : opt.inactiveStyle;
                const faceClass =
                  expandedFace === 'icon'
                    ? INLINE_PILL_ICON_FACE
                    : expandedFace === 'iconLabel'
                      ? INLINE_PILL_ICON_LABEL
                      : PILL_BASE;
                return (
                  <motion.button
                    key={opt.value || '__none__'}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={opt.label}
                    title={opt.title ?? opt.label}
                    initial={reduceMotion ? false : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={optionTransition(i)}
                    onClick={() => {
                      onSelect(opt.value);
                      onOpenChange(false);
                    }}
                    className={cn(faceClass, 'border', tone, focusRing('control', 'accent'))}
                    style={toneStyle}
                  >
                    {expandedFace === 'icon' ? (
                      <span className="grid place-items-center" aria-hidden>
                        {opt.face ?? opt.label}
                      </span>
                    ) : expandedFace === 'iconLabel' ? (
                      <>
                        <span className="grid h-5 w-5 place-items-center" aria-hidden>
                          {opt.face ?? EMPTY_FACE}
                        </span>
                        <span>{opt.label}</span>
                      </>
                    ) : (
                      opt.label
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={swapTransition}
            // Fill the chrome row — a content-sized wrap left urgency ·
            // platform shorter than type / Exit (the "hairline gap" misread).
            className="flex h-full shrink-0 items-stretch"
          >
            {collapsedFaceWrap}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
