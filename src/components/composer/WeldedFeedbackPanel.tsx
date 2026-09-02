'use client';

/**
 * WeldedFeedbackPanel — a state panel that is a physical extension of the
 * surface below it, not a card floating above it.
 *
 * The Unbox receive verdict used to mount as its own rounded card with its own
 * margin over the notes composer. Two shells, one moment: the operator's eye
 * had to bridge a gap to connect "what I just did" with "the field I am about
 * to type in". This panel welds instead — square bottom, NO bottom border, and
 * the composer underneath flattens its top radius ({@link
 * OmnichannelComposerDock} `weldTop`) so the two boxes share one silhouette.
 * The single border line left between them reads as the hinge.
 *
 * STAFF SoT — the mouth talks back here. Staff spend the day on
 * StationComposerHost; this panel is the only place the product shows what
 * just happened and what they must process next (Zoho receive, seller refine,
 * claim, link, in-flight). Mount via host `reaction` (any mode) or
 * `ticketAccessory` (Ticket). Pair with dock `weldTop` + {@link WeldedStack}.
 * Do not fork a caption band, toast, or second card. `steps` is the truncated
 * hinge line; `children` is More (`disclose=toggle`) or the always-open body
 * (`disclose=always`). Dockless workbench feedback stays InlineActionFeedbackCard.
 *
 * MOTION is that hinge: `framerPresence.weldedPanelPeel` tilts the panel back
 * on its bottom edge and swings it up out of the composer. `transformOrigin`
 * is `bottom` because that edge is the joint — animating from any other origin
 * would make a welded panel slide like a separate card again. Reduced motion
 * strips the rotation and leaves the height collapse.
 *
 * LAYOUT is mobile-first and deliberately unforgiving: the status text is the
 * only flexible cell and it hard-truncates (`min-w-0` + `truncate`), so a long
 * inventory error can never push the actions off a station tablet's screen.
 * The action cluster is `shrink-0` and flush right. Anything that does not fit
 * on one line belongs in the disclosure, not in the row.
 */

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
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import {
  INLINE_ACTION_FEEDBACK_TONE,
  type InlineActionFeedbackTone,
} from './inline-action-feedback-tone';
/** How long each derived step holds before the ticker advances. */
export const PHASE_STEP_MS = 2_200;

/**
 * Cycle a list of step strings, returning the one to paint.
 *
 * Restarts at 0 whenever the CONTENT changes (not the array identity) — a
 * caller that rebuilds its steps every render must not reset the ticker on
 * every frame, and a caller whose steps genuinely change must not resume
 * mid-list against the new set.
 */
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
  disclose = 'toggle',
  moreOpen = false,
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
  /**
   * `toggle` (default) — receive confirm: one truncated line; details behind More.
   * `always` — accessory body stays open (seller paste, claim type) so the
   * status row is still the hinge and children are not a second shell.
   */
  disclose?: 'toggle' | 'always';
  moreOpen?: boolean;
  onToggleMore?: () => void;
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
  const peel = useMotionPresence(framerPresence.weldedPanelPeel);
  const peelTransition = useMotionTransition(framerTransition.weldedPanelPeel);
  const collapse = useMotionPresence(framerPresence.collapseHeight);
  const collapseTransition = useMotionTransition(framerTransition.stationCollapse);
  const showMoreToggle = disclose === 'toggle' && Boolean(onToggleMore) && Boolean(children);
  const bodyOpen = disclose === 'always' ? Boolean(children) : Boolean(moreOpen && children);
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
      data-disclose={disclose}
    >
      <div
        className={cn(
          // No bottom border and no bottom radius: the composer below supplies
          // both. `shadow-inner` sinks the panel a plane behind the field it
          // hinges out of.
          // ORDER MATTERS: `cn` is tailwind-merge, and `rounded-2xl` owns the
          // whole corner group — listed after `rounded-b-none` it would drop
          // it and round the welded edge back off.
          COMPOSER_SHELL_CORNER,
          // `relative` positions the edge sweep below. No `overflow-hidden`
          // here on purpose — the sweep clips itself, and clipping the whole
          // box would eat the CTA's focus ring at the edges.
          'relative rounded-b-none border border-b-0 shadow-inner',
          // The STROKE is the silhouette's, not this half's. It used to be
          // `palette.border`, so the shared outline ran amber down the panel
          // and slate down the composer, and the seam hairline (the composer's
          // border-top) was a foreign grey line laid across an amber box —
          // read by operators as a gap between two shells. Tone lives in the
          // FILL, the glyph and the text; the outline is one colour all the
          // way round, exactly as the focus recipe below already assumed.
          'border-border-soft',
          palette.bg,
          // Follow the composer's focus state. The stroke is the OUTLINE of a
          // single silhouette, so it cannot change colour halfway up it: with
          // the composer at `border-blue-500` and this panel left on its tone
          // border, focusing the note field drew a strong blue edge for the
          // bottom box and a pale one for the top, which is the seam the weld
          // exists to erase. Only the stroke follows — fill, glyph and text
          // stay tone, so an amber verdict still reads amber while focused.
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
            {showMoreToggle ? (
            <HoverTooltip label={moreOpen ? 'Hide details' : 'More'} asChild>
              <IconButton
                ariaLabel={moreOpen ? 'Hide details' : 'More'}
                aria-expanded={moreOpen}
                onClick={onToggleMore}
                className="rounded p-0.5 text-text-faint hover:bg-surface-card/60 hover:text-text-muted"
                icon={<MoreHorizontal className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
            ) : null}
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
          {bodyOpen ? (
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
          //
          // As an in-flow strip with `bg-border-soft` this was a 2px slate band
          // spanning the seam — grey wherever the sweep was not — so the weld
          // read as a gap between the panel and the composer, and the joint
          // became 3px of chrome (track + the composer's border) instead of one
          // hairline. Out of flow it costs zero layout height, and with no
          // track the panel's own tint is what the sweep travels over.
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
            <div className={cn('recv-indet-bar h-full w-1/3', palette.bar)} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * WeldedStack — the focus owner for a welded pair.
 *
 * The focus ring belongs to the SILHOUETTE, not to one half of it. While the
 * composer painted its own ring, focusing the note field drew a blue outline
 * around the bottom box only: it stopped dead at the weld seam, and the panel
 * sitting on top was visibly outside the thing the operator had just focused.
 * That reads as two controls again, which is the entire failure the weld
 * exists to fix.
 *
 * So the ring moves up to the box that contains both, and the composer
 * suppresses its own halo while welded ({@link OmnichannelComposerDock}
 * `weldTop`). What the composer KEEPS is its blue border — it is the focused
 * field and its own edge should say so — and what the panel keeps is its tone
 * border, because a focus state must never overwrite a state colour (Kinetic
 * Ledger law 1: facts drive chrome). Focused and amber at once is the honest
 * picture: you are typing, and the last receive did not go through.
 *
 * Unwelded, this is an inert wrapper — the composer still owns its own ring,
 * so nothing about a bare composer changes.
 */
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
        // `halo`, not `wrapper`: that token is a border shift and this box has
        // no border to shift — the panel and the composer each carry their
        // own, and a third line out here would draw a box around a box. The
        // ring is the part that has to span both.
        welded && focusRing('halo', 'accent'),
        // ELEVATION is silhouette-level chrome too, for the same reason as the
        // ring. `OmnichannelComposerDock` paints `elevationClass('raised')` on
        // its own shell, so a welded pair sat on a shadow that started halfway
        // up it: outside the composer's edges the plane fell away, outside the
        // panel's it was flat, and that step at the joint is the light band.
        // The dock drops its shadow while `weldTop` and this box casts one for
        // both — one shape, one plane.
        welded && elevationClass('raised'),
      )}
      data-welded-stack={welded ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
