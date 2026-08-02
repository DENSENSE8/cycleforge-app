'use client';

/**
 * Collapse-to-active pill selector. Collapsed, it shows the **identity** of the
 * current value (tone-coded icon face, icon+name, or label); open, it shows the
 * full option set inline so the operator picks without a floating dropdown.
 *
 * Open/closed is *parent-controlled* (`open` + `onOpenChange`) so the carton
 * bar can orchestrate one picker at a time. The same primitive backs platform,
 * receiving-type, AND urgency pills.
 *
 * Motion: opacity-only swaps (no layout anim); no `mode="wait"` gap between
 * collapsed ↔ expanded. Timing from `framerTransition` / `motionBezier`.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { Flag, Globe, Tag } from '@/components/Icons';
import { TOP_CHROME_ICON_GLYPH, HEADER_ICON_WRAP } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
  title?: string;
  /**
   * Identity face (platform mark / type glyph / urgency flag). Used when
   * `collapsedFace` or `expandedFace` is `"icon"` / `"iconLabel"`.
   */
  face?: ReactNode;
}

/**
 * Dimension glyphs — Urgency / Platform / Type section eyebrows only.
 * Collapsed identity faces use per-option `face`, not these.
 */
export const INLINE_PILL_LEADING = {
  urgency: <Flag className={TOP_CHROME_ICON_GLYPH} />,
  platform: <Globe className={TOP_CHROME_ICON_GLYPH} />,
  type: <Tag className={TOP_CHROME_ICON_GLYPH} />,
} as const;

const PILL_BASE =
  'inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-role-micro uppercase tracking-wide transition-colors';
/**
 * Locked equal width for icon-only faces — same hit box as
 * {@link HEADER_ICON_WRAP} (`h-8 w-8`).
 */
export const INLINE_PILL_ICON_FACE =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors';
/** Icon + full name — expanded option pads / default collapsed. */
const INLINE_PILL_ICON_LABEL =
  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border pl-1.5 pr-2.5 text-role-micro font-semibold uppercase tracking-wide transition-colors';
/**
 * Carton bookmark — equal-width quiet shell. Short SoT label + identity face;
 * full name lives in HoverTooltip. Compact lock sized to icon + ≤4-char short
 * (`High` / `Med` / `Trade` truncated).
 */
const INLINE_PILL_ICON_LABEL_BOOKMARK =
  'inline-flex h-8 w-14 min-w-14 max-w-14 shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-full border px-1 text-role-micro font-medium uppercase tracking-wide transition-colors shadow-none box-border';

const DEFAULT_ACTIVE = 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm';
const DEFAULT_INACTIVE =
  'border-border-soft bg-surface-card/70 text-text-muted hover:border-border-default hover:bg-surface-hover';

const EMPTY_FACE = (
  <span className="text-role-micro text-current" aria-hidden>
    —
  </span>
);

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
  collapsedFace?: 'label' | 'icon' | 'iconLabel';
  /** How expanded options render. */
  expandedFace?: 'label' | 'icon' | 'iconLabel';
  /**
   * `bookmark` — equal-width quiet icon+shortLabel shell + HoverTooltip full name.
   * CartonContextCard classify strip only.
   */
  collapsedVariant?: 'default' | 'bookmark';
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const isBookmark = collapsedVariant === 'bookmark';

  useEffect(() => {
    if (!open || readOnly) return;
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
  }, [open, onOpenChange, readOnly]);

  const active = options.find((o) => o.value === value) ?? null;
  const showOpen = open && !readOnly;
  const fullLabel =
    collapsedFullLabel ?? active?.label ?? collapsedLabel ?? placeholder;
  const faceLabel = isBookmark
    ? (collapsedLabel ?? active?.shortLabel ?? active?.label ?? placeholder)
    : (collapsedLabel ?? active?.label ?? placeholder);
  const faceTone =
    collapsedClass ?? (active ? active.activeClass ?? DEFAULT_ACTIVE : DEFAULT_INACTIVE);
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
    collapsedFace === 'icon'
      ? INLINE_PILL_ICON_FACE
      : collapsedFace === 'iconLabel'
        ? isBookmark
          ? INLINE_PILL_ICON_LABEL_BOOKMARK
          : INLINE_PILL_ICON_LABEL
        : PILL_BASE;

  const collapsedClassName = cn(
    collapsedShell,
    faceTone,
    isBookmark && 'shadow-none',
    focusRing('control', 'accent'),
    readOnly && 'pointer-events-none',
  );

  const collapsedFaceNode =
    collapsedFace === 'icon' ? (
      <span className="grid place-items-center" aria-hidden>
        {identityFace}
      </span>
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
      faceLabel
    );

  const collapsedButton = (
    <button
      type="button"
      aria-haspopup={readOnly ? undefined : 'true'}
      aria-label={
        readOnly ? `${ariaLabel}: ${fullLabel}` : `${ariaLabel}: ${fullLabel} — click to change`
      }
      title={isBookmark ? undefined : tooltipLabel}
      onClick={readOnly ? undefined : () => onOpenChange(true)}
      className={collapsedClassName}
    >
      {collapsedFaceNode}
    </button>
  );

  return (
    <div
      ref={ref}
      className={`flex items-center ${showOpen ? 'min-w-0 flex-1' : 'shrink-0'} ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
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
            className="shrink-0"
          >
            {isBookmark ? (
              <HoverTooltip label={tooltipLabel} asChild>
                {collapsedButton}
              </HoverTooltip>
            ) : (
              collapsedButton
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default InlinePillPicker;
