'use client';

/**
 * Collapse-to-active pill selector. Collapsed, it shows the **identity** of the
 * current value (tone-coded icon face, icon+name, or label).
 *
 * Two presentations:
 * - `menu` (carton-context default) — chip-anchored {@link DropdownMenu} with
 *   tone-colored labels only (no icons); identity band stays put. Classify
 *   Displays keeps the full searchable editor when staff open that leaf
 *   themselves.
 * - `inline` — expands the option set in-row (legacy / hosts that need a
 *   horizontal strip without a floating layer).
 *
 * Open/closed is *parent-controlled* (`open` + `onOpenChange`) so a host can
 * orchestrate one picker at a time. The same primitive backs platform,
 * receiving-type, AND urgency pills.
 *
 * Motion (inline only): opacity-only swaps; no `mode="wait"` gap. Timing from
 * `framerTransition` / `motionBezier`.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { HEADER_ICON_WRAP } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { motionBezier, framerDuration } from '@/design-system/foundations/motion-framer';
import { cn } from '@/utils/_cn';

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
const PILL_BASE =
  'inline-flex box-border h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border px-1.5 text-role-micro font-semibold uppercase leading-none tracking-wide transition-colors shadow-none';
/**
 * Locked equal-width icon-only faces — square peer of carton exit
 * ({@link STATION_CONTEXT_EXIT_PILL_CLASS}); height from the chrome row.
 */
const INLINE_PILL_ICON_FACE =
  'inline-flex box-border h-full aspect-square shrink-0 items-center justify-center rounded-none border transition-colors shadow-none';
/** Icon + full name — expanded option pads / default collapsed. */
const INLINE_PILL_ICON_LABEL =
  'inline-flex box-border h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border pl-1.5 pr-2.5 text-role-micro font-semibold uppercase leading-none tracking-wide transition-colors shadow-none';
/**
 * Carton bookmark — equal-width quiet shell. Short SoT label + identity face;
 * full name lives in HoverTooltip. Compact lock sized to icon + ≤4-char short
 * (`High` / `Med` / `Trade` truncated). Height fills station chrome row.
 */
const INLINE_PILL_ICON_LABEL_BOOKMARK =
  'inline-flex box-border h-full w-14 min-w-14 max-w-14 shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-none border px-1 text-role-micro font-medium uppercase leading-none tracking-wide transition-colors shadow-none';

const DEFAULT_ACTIVE = 'border-blue-200 bg-blue-50 text-blue-700 shadow-none';
const DEFAULT_INACTIVE =
  'border-border-soft bg-surface-card/70 text-text-muted hover:border-border-default hover:bg-surface-hover';

const EMPTY_FACE = (
  <span className="text-role-micro text-current" aria-hidden>
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
   * `menu` — chip-anchored dropdown (carton-context inline edit).
   * `inline` — in-row option strip (legacy expand).
   */
  presentation?: 'inline' | 'menu';
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

  const active = options.find((o) => o.value === value) ?? null;
  const showOpen = open && !readOnly && !isMenu;
  const fullLabel =
    collapsedFullLabel ?? active?.label ?? collapsedLabel ?? placeholder;
  const faceLabel = isBookmark
    ? (collapsedLabel ?? active?.shortLabel ?? active?.label ?? placeholder)
    : (collapsedLabel ?? active?.label ?? placeholder);
  const faceTone = IDENTITY_PILL;
  const faceStyle = undefined;
  const identityFace = active?.face ?? EMPTY_FACE;
  const tooltipLabel = `${ariaLabel}: ${active?.title ?? fullLabel}${
    readOnly ? '' : ' — click to change'
  }`;

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
    // Paint over the sibling `-ml-px` seam so one-token classify stays crisp.
    'relative z-base hover:z-raised focus-visible:z-raised',
    focusRing('control', 'accent'),
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
      aria-expanded={readOnly ? undefined : open}
      aria-label={
        readOnly ? `${ariaLabel}: ${fullLabel}` : `${ariaLabel}: ${fullLabel} — click to change`
      }
      title={isBookmark ? undefined : tooltipLabel}
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
    const menuTrigger = isBookmark ? (
      <HoverTooltip label={tooltipLabel} asChild>
        <DropdownMenuTrigger asChild>{collapsedButton}</DropdownMenuTrigger>
      </HoverTooltip>
    ) : (
      <DropdownMenuTrigger asChild>{collapsedButton}</DropdownMenuTrigger>
    );

    return (
      <div
        ref={ref}
        data-inline-pill=""
        data-presentation="menu"
        className={cn(
          'flex h-full shrink-0 self-stretch items-stretch',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {readOnly ? (
          <div className="flex h-full shrink-0 items-stretch">{collapsedFaceWrap}</div>
        ) : (
          <DropdownMenu open={open} onOpenChange={onOpenChange}>
            {menuTrigger}
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={4}
              className="min-w-[10rem] max-w-[18rem] border border-border-soft"
              aria-label={ariaLabel}
            >
              {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                  <DropdownMenuItem
                    key={opt.value || '__none__'}
                    onSelect={() => onSelect(opt.value)}
                    className={cn(
                      'gap-2 bg-surface-card font-semibold text-text-default',
                      isActive && 'bg-surface-sunken',
                    )}
                    aria-label={opt.title ?? opt.label}
                  >
                    <IdentityDot opt={opt} />
                    <span className="min-w-0 flex-1 truncate text-text-default">
                      {opt.label}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
                    className={cn(faceClass, tone, focusRing('control', 'accent'))}
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
