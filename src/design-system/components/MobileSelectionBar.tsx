'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, X } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  SELECTION_BAR_CONTROL_BOX,
  SELECTION_BAR_VIEWPORT_GAP,
} from '@/design-system/components/selection-bar-geometry';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Mass actions, in declaration order. `danger` tints the icon rose (delete). */
export type MobileSelectionAction = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'danger';
  onTap?: () => void;
};

interface MobileSelectionBarProps {
  count: number;
  total: number;
  allSelected: boolean;
  visible?: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onDismiss?: () => void;
  actions?: MobileSelectionAction[];
  /** Pin to viewport bottom when the page scrolls (dashboard bulk actions). */
  pinToViewport?: boolean;
}

const spring = { type: 'spring', stiffness: 620, damping: 40 } as const;

/** Control hit-box — from the geometry SoT, which a bounded scroll host reads
 *  to size its bottom reserve. Never re-type the box here. */
const HIT_BOX = SELECTION_BAR_CONTROL_BOX;

// Light design-system palette — matches the repo's white/blur action chrome
// (StickyActionBar) rather than the old dark-glass capsule.
const TONE = {
  iconBtn: 'text-text-soft hover:bg-surface-sunken hover:text-text-default',
  danger: 'text-rose-600 hover:bg-rose-50',
  saChip: 'bg-surface-canvas ring-border-soft hover:bg-surface-sunken',
  saRing: 'border-border-default bg-surface-card text-text-muted',
  saActive: 'border-blue-600 bg-blue-600 text-white',
  clear: 'text-text-faint hover:bg-surface-sunken hover:text-text-muted',
};

function SelectAll({ count, allSelected, onToggleAll }: { count: number; allSelected: boolean; onToggleAll: () => void }) {
  const label = allSelected ? 'Deselect all' : `Select all — ${count} checked`;
  return (
    <HoverTooltip label={label} asChild>
      <motion.button
        onClick={onToggleAll}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'flex shrink-0 items-center rounded-full p-1 ring-1 transition-colors',
          TONE.saChip,
          focusRing('control', 'accent'),
        )}
        aria-label={label}
      >
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-150', allSelected ? TONE.saActive : TONE.saRing)}>
          {allSelected ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
              <Check className="h-4 w-4" />
            </motion.div>
          ) : (
            <AnimatedStat
              value={count}
              speed="fast"
              className="flex h-4 items-center justify-center text-role-micro "
            />
          )}
        </span>
      </motion.button>
    </HoverTooltip>
  );
}

function GlassActions({
  actions,
  onClear,
  onDismiss,
}: {
  actions: MobileSelectionAction[];
  onClear: () => void;
  onDismiss?: () => void;
}) {
  const handleClear = onDismiss ?? onClear;

  return (
    <motion.div
      variants={{
        visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
      }}
      initial="hidden"
      animate="visible"
      className="ml-auto flex items-center gap-0.5"
    >
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          // The capsule is icon-only, so the label is the ONLY thing naming the
          // action. `title=` renders after ~1s, unstyled — long enough that an
          // operator reads the row as unlabelled and the click as a no-op.
          <HoverTooltip key={a.key} label={a.label} asChild>
            <motion.button
              aria-label={a.label}
              onClick={a.onTap}
              variants={{
                hidden: { opacity: 0, scale: 0.8 },
                visible: { opacity: 1, scale: 1 },
              }}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.88 }}
              className={cn(
                HIT_BOX,
                'transition-colors',
                a.tone === 'danger' ? TONE.danger : TONE.iconBtn,
                focusRing('control', a.tone === 'danger' ? 'danger' : 'accent'),
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </motion.button>
          </HoverTooltip>
        );
      })}
      {/* Hairline divider keeps the dismiss control visually distinct from actions. */}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-surface-strong" />
      <HoverTooltip label={onDismiss ? 'Exit selection mode' : 'Clear selection'} asChild>
        <motion.button
          onClick={handleClear}
          aria-label={onDismiss ? 'Exit selection mode' : 'Clear selection'}
          variants={{
            hidden: { opacity: 0, scale: 0.8 },
            visible: { opacity: 1, scale: 1 },
          }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          className={cn(HIT_BOX, 'transition-colors', TONE.clear, focusRing('control', 'neutral'))}
        >
          <X className="h-4 w-4" />
        </motion.button>
      </HoverTooltip>
    </motion.div>
  );
}

function useBarAnim() {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 },
    // Snappy, no overshoot: the bar answers a click on a checkbox, so it should
    // read as instant arrival. The old 100px throw at damping 30 both overshot
    // and travelled far enough to look like a page element sliding in.
    transition: reduce
      ? { duration: 0 }
      : { type: 'spring', stiffness: 620, damping: 40, mass: 0.7 },
  } as const;
}

// Light, clean surface that reads as part of the white table chrome (mirrors
// StickyActionBar's `bg-surface-card/90 backdrop-blur border`) instead of dark
// glass. Depth comes from the elevation SoT — this is floating UI, so `overlay`
// (never a hand-rolled `shadow-xl shadow-gray-900/10`, which is one downward
// cast and goes flat against a tall grid).
const SURFACE_LIGHT = cn(
  'bg-surface-card/95 ring-1 ring-border-default backdrop-blur-2xl',
  elevationClass('overlay'),
);

export function MobileSelectionBar({
  count,
  allSelected,
  visible = count > 0,
  onToggleAll,
  onClear,
  onDismiss,
  actions = [],
  pinToViewport = false,
}: MobileSelectionBarProps) {
  const anim = useBarAnim();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          {...anim}
          className={cn(
            // Named band, never a raw z-N: this is a floating action surface —
            // above the grid and its sticky day bands (`z-sticky`/`z-header`),
            // below every panel/dialog it opens (`z-panel` and up).
            'z-fab px-3',
            SELECTION_BAR_VIEWPORT_GAP,
            // The positioner spans the full width but the capsule inside is
            // fit-content — without this, the empty gutters either side of the
            // capsule swallow every click on the rows behind them.
            'pointer-events-none',
            pinToViewport ? 'fixed inset-x-0 bottom-0' : 'absolute inset-x-0 bottom-0',
          )}
        >
          {/* Compact centered capsule — fit-content, never viewport-wide. A
              full-width bar overflowed the grid shell on desktop selection and
              hid the count under floating chrome. */}
          <div className={cn('pointer-events-auto relative mx-auto flex w-full max-w-fit items-center rounded-full p-1.5', SURFACE_LIGHT)}>
            <div
              role="toolbar"
              aria-label="Bulk actions for the current selection"
              className="relative flex flex-1 items-center gap-2"
            >
              <SelectAll count={count} allSelected={allSelected} onToggleAll={onToggleAll} />
              <span className="text-role-eyebrow uppercase tracking-wider text-text-soft">
                selected
              </span>
              <GlassActions actions={actions} onClear={onClear} onDismiss={onDismiss} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
