'use client';

/** WeldedFeedbackPanel — a state panel that is a physical extension of the surface below it, not a card floating above it. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { MoreHorizontal, X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { Button, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  motionPresence,
  motionTransition,
} from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import {
  INLINE_ACTION_FEEDBACK_TONE,
  type InlineActionFeedbackTone,
} from './inline-action-feedback-tone';

/** How long each derived step holds before the ticker advances. */
const PHASE_STEP_MS = 2_200;

/** Cycle a list of step strings, returning the one to paint. */
function useCyclingStep(steps: string[], active: boolean): string {
  const [index, setIndex] = useState(0);
  const signature = steps.join(' \u0000 ');
  const signatureRef = useRef(signature);

  if (signatureRef.current !== signature) {
    signatureRef.current = signature;
    if (index !== 0) setIndex(0);
  }

  useEffect(() => {
    if (!active || steps.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % steps.length);
    }, PHASE_STEP_MS);
    return () => window.clearInterval(id);
    // `signature` (not `steps`) so a re-created array of the same strings does
    // not tear down and restart the interval on every render.
  }, [active, signature, steps.length]);

  return steps[Math.min(index, steps.length - 1)] ?? '';
}

export type WeldedFeedbackCta = {
  label: string;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
};

export function WeldedFeedbackPanel({
  tone,
  steps,
  cycling = false,
  leading,
  meta,
  cta,
  moreOpen,
  onToggleMore,
  onDismiss,
  edgeProgress = false,
  children,
}: {
  tone: InlineActionFeedbackTone;
  /** Derived status lines. One = static; more = the ticker cycles them. */
  steps: string[];
  /** Only cycle while the underlying work is genuinely still running. */
  cycling?: boolean;
  /** Small state glyph left of the status text. */
  leading?: ReactNode;
  /** Tabular right-of-status fact (elapsed seconds, commit time). */
  meta?: string;
  /** The one dynamic verb for this state. Omitted when the state has no action. */
  cta?: WeldedFeedbackCta;
  moreOpen: boolean;
  onToggleMore: () => void;
  onDismiss?: () => void;
  /**
   * Paint the indeterminate sweep along the welded edge itself. The bar sits
   * ON the joint, so in-flight work reads as the seam being live rather than
   * as a second progress widget stacked inside the row.
   */
  edgeProgress?: boolean;
  /** Disclosure body — everything that does not fit the single row. */
  children?: ReactNode;
}) {
  const palette = INLINE_ACTION_FEEDBACK_TONE[tone];
  const peel = useMotionPresence(motionPresence.weldedPanelPeel);
  const peelTransition = useMotionTransition(motionTransition.weldedPanelPeel);
  const collapse = useMotionPresence(motionPresence.collapseHeight);
  const collapseTransition = useMotionTransition(motionTransition.stationCollapse);
  const status = useCyclingStep(steps, cycling);

  return (
    <motion.div
      initial={peel.initial}
      animate={peel.animate}
      exit={peel.exit}
      transition={peelTransition}
      // The joint. Everything about this panel's motion hangs off the edge it
      // is welded to.
      style={{ transformOrigin: 'bottom' }}
      className="overflow-hidden"
      data-testid="welded-feedback-panel"
      data-tone={tone}
    >
      <div
        className={cn(
          // No bottom border and no bottom radius:
          COMPOSER_SHELL_CORNER,
          // `relative` positions the edge sweep below. No `overflow-hidden`
          // here on purpose — the sweep clips itself, and clipping the whole
          // box would eat the CTA's focus ring at the edges.
          'relative rounded-b-none border border-b-0 shadow-inner',
          // The STROKE is the silhouette's, not this half's.
          'border-border-soft',
          palette.bg,
          // Follow the composer's focus state.
          focusRing('grouped', 'accent'),
        )}
      >
        <div className="flex min-w-0 items-center gap-2 px-3 py-2">
          {leading ? <span className={cn('shrink-0', palette.icon)}>{leading}</span> : null}

          {/* The ONLY flexible cell. min-w-0 lets it shrink below its content
              so `truncate` can actually bite; without it flexbox floors the
              cell at its text width and the actions get pushed off-screen. */}
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={status}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                className={cn(
                  'truncate text-role-caption font-semibold leading-tight',
                  palette.title,
                )}
              >
                {status}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {meta ? (
              <span
                className={cn(
                  'hidden text-role-eyebrow font-semibold tabular-nums sm:inline',
                  palette.meta,
                )}
              >
                {meta}
              </span>
            ) : null}
            {cta ? (
              <Button
                variant={palette.cta}
                size="sm"
                // This CTA lives inside the composer shell, beside a footer
                // track and a Send control that are both already soft. Flush
                // here is the odd one out, not the conformant one.
                radius="composer"
                type="button"
                disabled={cta.disabled}
                ariaLabel={cta.ariaLabel ?? cta.label}
                onClick={cta.onClick}
              >
                {cta.label}
              </Button>
            ) : null}
            <HoverTooltip label={moreOpen ? 'Hide details' : 'More'} asChild>
              <IconButton
                ariaLabel={moreOpen ? 'Hide details' : 'More'}
                aria-expanded={moreOpen}
                onClick={onToggleMore}
                className="rounded p-0.5 text-text-faint hover:bg-surface-card/60 hover:text-text-muted"
                icon={<MoreHorizontal className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
            {onDismiss ? (
              <HoverTooltip label="Dismiss" asChild>
                <IconButton
                  ariaLabel="Dismiss"
                  onClick={onDismiss}
                  className="rounded p-0.5 text-text-faint hover:bg-surface-card/60 hover:text-text-muted"
                  icon={<X className="h-3 w-3" />}
                />
              </HoverTooltip>
            ) : null}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {moreOpen && children ? (
            <motion.div
              key="welded-more"
              initial={collapse.initial}
              animate={collapse.animate}
              exit={collapse.exit}
              transition={collapseTransition}
              className="overflow-hidden"
            >
              <div className={cn('border-t px-3 pb-2.5 pt-2', palette.border)}>{children}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {edgeProgress ? (
          // ABSOLUTE, and with no track behind it.
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <div className={cn('recv-indet-bar h-full w-1/3', palette.bar)} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/** WeldedStack — the focus owner for a welded pair. */
export function WeldedStack({
  welded,
  children,
}: {
  welded: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        COMPOSER_SHELL_CORNER,
        // `group` so the panel can follow this box's focus state — it is the
        // only element that knows the composer inside it has focus.
        'group',
        // `halo`, not `wrapper`:
        welded && focusRing('halo', 'accent'),
        // ELEVATION is silhouette-level chrome too, for the same reason as the ring.
        welded && elevationClass('raised'),
      )}
      data-welded-stack={welded ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
