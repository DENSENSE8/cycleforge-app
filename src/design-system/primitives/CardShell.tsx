'use client';

import { forwardRef, type ReactNode } from 'react';
import { motion, motionRole, useMotionPressRole, useReducedMotion } from '@/design-system/motion';
import { useUIModeOptional } from '../providers/UIModeProvider';
import {
  motionPresence,
  motionPresenceMobile,
  motionTransition,
  motionTransitionMobile,
  motionGesture,
} from '../foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '../foundations/motion-presets-hooks';
import { staggerRevealRiseItem } from './StaggerReveal';

type CardTone = 'emerald' | 'red' | 'orange' | 'purple' | 'teal' | 'gray';

/** Visual treatment when `isSelected` is true on desktop. */
type CardShellVariant = 'stripe' | 'framed' | 'linear' | 'rail';

interface CardShellProps {
  children: ReactNode;
  isExpanded?: boolean;
  /**
   * The card is the right-pane workspace target. Stronger than `isExpanded`:
   * adds a tinted background and (in `stripe` variant) a left-edge accent
   * stripe, or (in `framed` variant) a full perimeter ring + lift.
   */
  isSelected?: boolean;
  tone?: CardTone;
  /** Use stock-tab styling (red border variant). */
  isStock?: boolean;
  /** Desktop selected-state treatment. Defaults to `stripe`. */
  variant?: CardShellVariant;
  /** Mount entrance. */
  entrance?: 'self' | 'stagger';
  onClick?: () => void;
  /** Hover passthrough — wired by callers that anchor a hover preview to the card. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
}

const TONE_BORDER: Record<CardTone, { idle: string; active: string }> = {
  emerald: { idle: 'border-emerald-200', active: 'border-emerald-500' },
  red:     { idle: 'border-red-300',     active: 'border-red-500' },
  orange:  { idle: 'border-orange-200',  active: 'border-orange-500' },
  purple:  { idle: 'border-purple-200',  active: 'border-purple-500' },
  teal:    { idle: 'border-teal-200',    active: 'border-teal-500' },
  gray:    { idle: 'border-border-soft',    active: 'border-border-emphasis' },
};

const TONE_SELECTED: Record<CardTone, { bg: string; accent: string; ring: string }> = {
  emerald: { bg: 'bg-emerald-50/70',  accent: 'before:bg-emerald-500', ring: 'ring-emerald-300' },
  red:     { bg: 'bg-red-50/70',      accent: 'before:bg-red-500',     ring: 'ring-red-300' },
  orange:  { bg: 'bg-orange-50/70',   accent: 'before:bg-orange-500',  ring: 'ring-orange-300' },
  purple:  { bg: 'bg-purple-50/70',   accent: 'before:bg-purple-500',  ring: 'ring-purple-300' },
  teal:    { bg: 'bg-teal-50/70',     accent: 'before:bg-teal-500',    ring: 'ring-teal-300' },
  gray:    { bg: 'bg-surface-canvas',        accent: 'before:bg-border-emphasis',    ring: 'ring-border-default' },
};

const CardShell = forwardRef<HTMLDivElement, CardShellProps>(function CardShell({
  children,
  isExpanded = false,
  isSelected = false,
  tone = 'emerald',
  isStock = false,
  variant = 'stripe',
  entrance = 'self',
  onClick,
  onMouseEnter,
  onMouseLeave,
  className = '',
}, ref) {
  const { isMobile } = useUIModeOptional();
  const activeTone = isStock ? 'red' : tone;
  const border = TONE_BORDER[activeTone];
  const selected = TONE_SELECTED[activeTone];
  // When selected, lock the border to the active color and add the
  // accent/tint. `isExpanded` keeps its border-only behavior so the two
  // states stack: a selected card that's also expanded still reads as "open".
  const showActiveBorder = isExpanded || isSelected;

  // Desktop: flat row separator.
  const desktopStripeClasses = `border-b-2 px-0 py-3 transition-colors relative cursor-pointer ${
    isSelected
      ? `${selected.bg} ${selected.accent} before:absolute before:inset-y-0 before:left-0 before:w-[3px]`
      : 'bg-surface-card'
  } ${showActiveBorder ? border.active : `${border.idle} hover:${border.active}`}`;

  const desktopFramedClasses = isSelected
    // Selected: flush ring, soft lift, tinted bg. Slight vertical margin so
    // the ring doesn't get clipped by neighbouring rows' separators.
    ? `relative cursor-pointer rounded-none px-0 py-3 my-1 transition-all ${selected.bg} ring-2 ring-inset ${selected.ring} shadow-[0_1px_2px_rgba(16,185,129,0.10),0_4px_12px_-4px_rgba(16,185,129,0.15)]`
    // Idle: continues to act as a row in the stack — bottom separator + hover.
    : `relative cursor-pointer px-0 py-3 transition-colors bg-surface-card border-b-2 ${border.idle} hover:${border.active}`;

  // `linear`: row stays in the stack at all times.
  const desktopLinearClasses = isSelected
    ? `relative cursor-pointer px-3 py-2.5 transition-colors ${selected.bg} ${selected.accent} before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full`
    : `relative cursor-pointer px-3 py-2.5 transition-colors bg-surface-card hover:bg-surface-hover`;

  // `rail`: flat recent-activity rail row.
  const desktopRailClasses = `relative cursor-pointer rounded-none px-2 py-1.5 transition-colors ${
    isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'bg-surface-card hover:bg-surface-hover'
  }`;

  const desktopClasses =
    variant === 'framed'
      ? desktopFramedClasses
      : variant === 'linear'
      ? desktopLinearClasses
      : variant === 'rail'
      ? desktopRailClasses
      : desktopStripeClasses;

  const mobileClasses = `rounded-2xl border mb-2 px-0 py-3 transition-colors relative ${
    isSelected
      ? `${selected.bg} ring-2 ring-inset ${selected.ring}`
      : 'bg-surface-card'
  } ${showActiveBorder ? border.active : `${border.idle} active:${border.active}`}`;

  const shouldReduce = useReducedMotion();
  const rawPresence = isMobile ? motionPresenceMobile.mobileCard : motionPresence.upNextRow;
  const rawTransition = isMobile ? motionTransitionMobile.mobileCardMount : motionTransition.upNextRowMount;
  const presence = useMotionPresence(rawPresence);
  const transition = useMotionTransition(rawTransition);
  // Linear + rail variants intentionally suppress the lift/scale hover gesture
  // so rows don't jump and neighbours never shift. Hover state is bg-only.
  const flatRow = variant === 'linear' || variant === 'rail';
  // `motionRole.gesture.press` — suppressed (not reduced) under prefers-reduced-motion.
  const pressGesture = useMotionPressRole(motionRole.gesture.press);
  const hoverGesture =
    shouldReduce || (!isMobile && flatRow) ? undefined : motionGesture.cardHover;

  // `stagger`: omit own initial/animate/transition so the card inherits the parent stagger-reveal container's hidden→show timeline (vertical…
  const entranceProps =
    entrance === 'stagger'
      ? { variants: staggerRevealRiseItem, exit: 'exit' as const }
      : { initial: presence.initial, animate: presence.animate, exit: presence.exit, transition };

  return (
    <motion.div
      ref={ref}
      layout={!shouldReduce}
      {...entranceProps}
      whileHover={hoverGesture}
      whileTap={pressGesture}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group ${isMobile ? mobileClasses : desktopClasses} ${className}`}
    >
      {children}
    </motion.div>
  );
});
