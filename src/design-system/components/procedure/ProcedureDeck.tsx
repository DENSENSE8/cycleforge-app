'use client';

/**
 * Procedure Focus Deck — the station's WORK surface.
 *
 * A single-focus card deck: the active step owns the focus slot at the BOTTOM
 * against the composer that commits it, completed steps read upward as a
 * chat-style transcript, and upcoming steps sit *behind and below* the focus
 * card as watchOS-style peeks that rise bottom→top into focus as the work
 * advances.
 *
 * ## Occlusion of a BODY is allowed. Occlusion of the RECORD is not.
 *
 * This component's docblock used to ban z-stacking outright, on the strength of
 * two deleted attempts (`UnboxCaptureStack` at `33a3eb609`, and the refused
 * depth pile). That ban named the wrong thing, and it is re-scoped here — not
 * lifted.
 *
 * A step's **body** — its capture controls — belongs to one card at a time.
 * Hiding the other eight bodies is the entire point of a focus surface and costs
 * nothing, because they are not actionable while another step is.
 *
 * A step's **record** — its label, state mark, summary and completion time — may
 * never be occluded once it exists. That is why the history reads as full title
 * rows and never as a pile: a settled step's timestamp is evidence, and a pile
 * that covers it is the refused depth pile no matter how good it looks.
 *
 * An **upcoming** step has no record yet — nothing but a name and a position —
 * so a sliver peek costs nothing that exists. What it costs instead is pointer
 * reachability past the single peek (see {@link PROCEDURE_PEEK}), and that cost
 * is only payable because two other surfaces reach those steps: the pager
 * pinned above the composer, and the right-edge checklist (see the coupling
 * below).
 *
 * ## Three invariants that did NOT move
 *
 *   1. HIDING     → every step is mounted, from the first frame.
 *   2. RE-SORTING → strict vocabulary order, always. A deck is a TRANSFORM,
 *                   never a filter and never a sort. `resolveActiveStep` decides
 *                   the focus; nothing decides membership.
 *   3. THE RECORD → a settled step is a full, legible row. Only queued steps —
 *                   which carry no record — are allowed behind anything.
 *
 * ## The checklist coupling (a precondition, not a preference)
 *
 * The centre is allowed a compressing geometry only because the right-edge
 * `checklist` display stays mounted and default. Queued layers past the visible
 * cap are covered here and are reached there. If the checklist is ever
 * de-defaulted, this deck reverts to a flat column in the same change.
 *
 * ## It is CONTENT, not a viewport
 *
 * The station host already owns the scroll (`StationWorkbench`'s
 * `flex-1 overflow-y-auto`). An earlier revision added a SECOND port here —
 * `flex-1 … snap-y snap-mandatory overflow-y-auto` — nested in a plain
 * `space-y-*` wrapper. `flex-1` has no basis there, so the port was never
 * height-constrained: it never scrolled, the snap never engaged, and the active
 * section's `min-h-[12rem]` floor rendered as a white void. Every `flex-1`,
 * `h-full`, `snap-*` and `min-h-*` on it was dead CSS that still occupied space.
 *
 * So: **check who owns the scroll before writing `overflow-*`.** This renders
 * into the host's port and adds none of its own — and it must not, because the
 * peek pile deliberately overhangs the focus card, and any `overflow-hidden` on
 * the way up would shear both the pile and the focus rings off inputs inside an
 * expanded body.
 *
 * ## Bottom-pinned, growing upward
 *
 * The resting position is against the composer, not the top of an empty canvas —
 * the operator's eye path is product → down → the live card → the input. That
 * geometry lives on the HOST (`StationWorkbench bodyAlign="end"` →
 * `min-h-full flex flex-col justify-end`), because a percentage min-height only
 * resolves against an ancestor with a definite height, and the scroll port is
 * the nearest one.
 *
 * ## Motion: transform + opacity, and no layout animation at all
 *
 * The pile is `z-index` + `scale` + `opacity`, transitioned in CSS. Travel to
 * the focus slot is `scrollIntoView` on the host port — not a framer transition,
 * not `layout`, not `layoutId` (face → focus is a *replace*, not a travel;
 * shared-layout there produces a morphing artifact), and not a scroll-linked
 * timeline (a scanner-driven operator does not scroll this list).
 *
 * A card's HEIGHT and its flow position still change when it takes focus. That
 * is a plain reflow in one un-animated frame, and it is never animated: a step
 * advances 9–24 times per carton, which is the exact case the layout-animation
 * ban exists to prevent.
 *
 * `motion-safe:` is mandatory on the CSS transitions — the app-wide
 * `MotionConfig` floor covers framer only and has no visibility into a Tailwind
 * `transition-*`. With the transitions removed the deck must still be readable,
 * because every depth cue (z-order, the scale inset, the opacity ladder) is a
 * static resting value rather than something the travel produces.
 *
 * ## It never takes focus — including when clicked
 *
 * No `autoFocus`, no focus trap, no `tabIndex` on the deck. The active section
 * is scrolled into view, never `.focus()`ed.
 *
 * A face button DOES natively take focus when clicked, and the wedge would then
 * type into it — so the caller's `onSelectStep` is responsible for handing focus
 * back to the scan bar. The domain adapter owns that (it knows the station's
 * event); this component stays domain-free.
 */

import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { Check, ChevronRight } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { ProcedureStepRow, ProcedureStepState } from './types';

/**
 * A settled or queued card — the compact face. ONE height constant, so the
 * deck's rhythm cannot drift per step and the pile's pull-up can be derived
 * from it rather than guessed.
 *
 * The active card had a `min-h-[12rem]` floor until 2026-08-02, and on a step
 * whose body is one camera button that floor was simply an empty white box —
 * which at a bench reads as "this step is broken", and costs the vertical room
 * the whole deck is spending to exist. **Never reserve height a body has not
 * asked for.** A face is different: it is a fixed one-row object whose height IS
 * its geometry.
 *
 * The rem twin is what the pile's negative margin is computed from. Both must
 * stay in rem: the root font-size moves with the Settings text-size control, and
 * a px pull-up against a rem card would drift the peek at every size but one.
 */
const PROCEDURE_STEP_FACE_REM = 4.5;
export const PROCEDURE_STEP_FACE_HEIGHT = 'h-[4.5rem]';

/** How much of each queued card shows below the one covering it. */
const PROCEDURE_PEEK_REM = 0.875;

/**
 * Gap between cards that are NOT tucked — history and focus.
 *
 * Applied per item rather than with `space-y-*`, and that is not a style
 * preference. Tailwind v4's `space-y-N` compiles to `margin-block-END` on every
 * child *except the last*, so the gap belongs to the card ABOVE — which means a
 * per-item `margin-top` pull-up cannot cancel it. The pile shipped 12px apart
 * instead of tucked, and both the computed `margin-top` and the class list read
 * exactly as intended while it did. Keep the margins explicit here.
 */
const PROCEDURE_CARD_GAP = 'mt-3';

/**
 * EXACTLY ONE queued card peeks; every other one collapses precisely behind it.
 *
 * It shipped as a three-layer pile for one revision, and three slivers of
 * translucent card at 60/45/30% did not read as depth — they read as one card
 * that had failed to paint. The bench screenshot showed "Serial" and "Detail"
 * double-imaged through two stacked sheets, which is the *record* becoming
 * illegible, and that is the one thing occlusion is never allowed to touch.
 *
 * One peek says everything the pile was for — *there is more after this, and it
 * is shaped like a card* — for a third of the geometry and none of the ghosting.
 * The count is deliberately not a knob: a second layer buys no information and
 * costs the focus card its adjacency to the composer.
 *
 * `origin-bottom` on the scale is load-bearing: it pins the card's bottom edge
 * so the visible sliver stays exactly one {@link PROCEDURE_PEEK_REM} tall while
 * the card insets from both sides — depth read as width, not as vertical drift.
 */
const PROCEDURE_PEEK = { z: 'z-20', scale: 'scale-[0.97]', opacity: 'opacity-70' } as const;

/**
 * The collapsed remainder, sitting exactly behind the peek.
 *
 * `z-10` — strictly BELOW the peek — and `pointer-events-none` are both
 * load-bearing, and the first revision had neither. Every queued card shared the
 * peek's `z-20`, so the covered cards (later siblings, same layer) painted on
 * top of it and swallowed every click on its sliver: the deck's only forward
 * affordance was pointer-dead, and it looked perfect in a screenshot. Nothing of
 * these cards is ever on screen, so they must not be able to take a click.
 */
const PROCEDURE_COVERED = { z: 'z-10', pointer: 'pointer-events-none' } as const;

/**
 * The history ladder is deliberately SHALLOW, and its floor is legibility.
 *
 * Dimming is a focus channel — *where the operator is* — never a state channel;
 * state stays on {@link StepStateMark}'s glyph and the label's tone, so a
 * colour-blind or low-vision operator loses nothing. But a settled row is the
 * record, and a record faded to 40% is occluded by another name. The most recent
 * completion keeps full ink because it is the thing the operator just did; older
 * rows step back one notch and stop.
 */
const PROCEDURE_HISTORY_OPACITY = { recent: 'opacity-100', older: 'opacity-80' } as const;

/** What one card wears — resolved by the domain, never chosen here. */
interface ProcedureCardFace {
  /** Big leading glyph. */
  Icon: ComponentType<{ className?: string }>;
  /** Icon medallion classes from the domain's hue registry. */
  medallionClass: string;
  /**
   * The card's own fill + border, from the domain's hue registry — a light tint
   * that says which family of work this step is without putting text on a
   * saturated ground.
   *
   * This replaced a leading accent edge (2026-08-02). Before that it was an
   * absolutely-positioned rail wearing `rounded-l-[inherit]`, which copied the
   * CARD's radius value onto a 4px box and rendered as a lens — the trap is
   * general and now lives in `ui-design-system.md`.
   */
  surfaceClass: string;
  /** Quantity ink classes. */
  quantityClass: string;
}

interface ProcedureDeckProps {
  /** Every step, in vocabulary order. Nothing is filtered out for display. */
  steps: ReadonlyArray<ProcedureStepRow>;
  /** The focused card. `null` ⇒ every step settled; the deck is all history. */
  activeKey: string | null;
  /** Icon + hue per step key — from the domain's face registry. */
  face: (step: ProcedureStepRow) => ProcedureCardFace;
  /** The ONE expanded body, rendered inside the focus card. */
  renderActive: (step: ProcedureStepRow) => ReactNode;
  /**
   * Jump to a card. A face is a button when this is supplied AND the card is
   * not covered by the pile.
   *
   * The caller MUST hand focus back to the scan bar — a clicked button holds
   * focus, and the next wedge scan would type into it.
   */
  onSelectStep?: (key: string) => void;
  className?: string;
}

function StepStateMark({ state }: { state: ProcedureStepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  // A waiver is never a check — the glyph is the only thing carrying "we decided
  // to move past this" rather than "this happened".
  if (state === 'skipped') {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface-strong text-text-soft ring-1 ring-inset ring-border-soft">
        <ChevronRight className="h-2.5 w-2.5" />
      </span>
    );
  }
  return null;
}

export function ProcedureDeck({
  steps,
  activeKey,
  face,
  renderActive,
  onSelectStep,
  className,
}: ProcedureDeckProps) {
  const activeRef = useRef<HTMLLIElement | null>(null);

  // Follow the pointer as steps complete — including after a scan lands its
  // evidence. Scrolls the HOST port (the nearest scrollable ancestor); this deck
  // owns no scroller of its own. `.focus()` is never called — the wedge owns
  // focus.
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeKey]);

  const { presence, transition } = useMotionRole(motionRole.swap.scan);

  if (steps.length === 0) return null;

  const activeIndex = activeKey ? steps.findIndex((step) => step.key === activeKey) : -1;

  return (
    <ol
      // No `overflow-*`, no `flex-1`, no `h-full`: the station host owns the
      // scroll port and this is content inside it.
      //
      // `isolate` keeps the deck's layer order private. Without it a card's
      // `z-20` competes with the app's named z bands, and a local pile order
      // would be free to outrank a panel.
      className={cn('isolate min-w-0', className)}
      aria-label="Procedure"
      data-procedure-deck
    >
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        // With no active step (a settled carton) every card is history and
        // nothing is dimmed — there is no "here" to be away from.
        const isQueued = activeIndex >= 0 && index > activeIndex;
        const { Icon, medallionClass, surfaceClass, quantityClass } = face(step);

        // Queued depth, 1-based. Depth 1 peeks; everything after it collapses
        // exactly behind depth 1 — no extra height, no extra sliver, all still
        // mounted and in order.
        const depth = isQueued ? index - activeIndex : 0;
        const isPeek = depth === 1;
        const isCovered = depth > 1;

        // One resolution, three zones. History steps back exactly one notch, and
        // only for the ones the operator has already moved past — the completion
        // they just made keeps full ink, and a fully settled carton dims nothing
        // at all. A covered card inherits the peek's alpha because it is exactly
        // behind it; nothing of it is ever on screen.
        const opacityClass = isQueued
          ? PROCEDURE_PEEK.opacity
          : isActive || activeIndex < 0 || index === activeIndex - 1
            ? PROCEDURE_HISTORY_OPACITY.recent
            : PROCEDURE_HISTORY_OPACITY.older;

        // The pull-up is LAYOUT, not decoration: it is what removes the queued
        // card's height from the flow so the focus card stays against the
        // composer while the whole tail stays mounted. Transform cannot do this
        // — an element that is only translated still occupies its full box.
        const pileStyle = isQueued
          ? {
              marginTop: `${-(PROCEDURE_STEP_FACE_REM - (isPeek ? PROCEDURE_PEEK_REM : 0))}rem`,
            }
          : undefined;

        const header = (
          <div className="flex min-w-0 items-center gap-3">
            {/* Big leading glyph — the thing that identifies the card at arm's
                length, before any text is read. */}
            <span
              className={cn(
                'flex shrink-0 items-center justify-center',
                cornerClass('control'),
                medallionClass,
                isActive ? 'h-11 w-11' : 'h-9 w-9',
              )}
            >
              <Icon className={isActive ? 'h-5 w-5' : 'h-4 w-4'} />
            </span>

            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  'truncate text-role-caption font-semibold',
                  step.state === 'pending' || step.state === 'skipped'
                    ? 'text-text-muted'
                    : 'text-text-default',
                )}
              >
                {step.label}
              </span>
              {step.at ? (
                <span className="truncate text-role-micro tabular-nums text-text-soft">
                  {step.at}
                </span>
              ) : null}
            </span>

            {/* Quantity right, in the card's own hue. `tabular-nums` so a count
                going 9 → 10 does not shuffle the row. */}
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {step.state === 'skipped' && step.skipReason ? (
                <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {step.skipReason}
                </span>
              ) : step.summary ? (
                <span
                  className={cn(
                    'truncate text-role-eyebrow uppercase tracking-widest tabular-nums',
                    quantityClass,
                  )}
                >
                  {step.summary}
                </span>
              ) : null}
              <StepStateMark state={step.state} />
            </span>
          </div>
        );

        return (
          <li
            key={step.key}
            ref={isActive ? activeRef : undefined}
            data-procedure-step={step.key}
            data-procedure-state={step.state}
            data-procedure-zone={isActive ? 'focus' : isQueued ? 'queued' : 'history'}
            aria-current={isActive ? 'step' : undefined}
            style={pileStyle}
            className={cn(
              // `relative` is what makes the layer classes below mean anything —
              // `z-index` is inert on a statically positioned box.
              'relative flex min-w-0 flex-col',
              // Explicit, per item — see PROCEDURE_CARD_GAP. A queued card's gap
              // is its inline pull-up instead.
              index > 0 && !isQueued && PROCEDURE_CARD_GAP,
              cornerClass('card'),
              // The functional hue is the card's own light fill. The depth still
              // comes from `elevationClass('raised')` against the canvas ground
              // plane — a 50-level tint sits above `background-canvas`, so the
              // shadow keeps something to cast onto. If that ever flattens, the
              // answer is a stronger canvas, never a heavier shadow.
              'border',
              surfaceClass,
              elevationClass('raised'),
              // ONE height constant, and it is not animated: a face is a fixed
              // one-row object, the focus card is exactly as tall as its body.
              isActive
                ? 'z-30 ring-1 ring-inset ring-blue-400'
                : cn(
                    PROCEDURE_STEP_FACE_HEIGHT,
                    isQueued && ['origin-bottom', PROCEDURE_PEEK.scale],
                    isPeek && PROCEDURE_PEEK.z,
                    isCovered && [PROCEDURE_COVERED.z, PROCEDURE_COVERED.pointer],
                  ),
              opacityClass,
              // CSS, not framer: this fires on every step advance across every
              // mounted card, and a re-render per card to move an alpha the
              // compositor gives away free is the trade this avoids. Height and
              // margin are deliberately NOT in the transition list — those are
              // the layout half, and they snap.
              'motion-safe:transition-[opacity,transform] motion-safe:duration-200',
            )}
          >
            {isActive ? (
              <div className="min-w-0 inset-card">
                {header}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step.key}
                    initial={presence.initial}
                    animate={presence.animate}
                    exit={presence.exit}
                    transition={transition}
                    className="min-w-0 pt-3"
                  >
                    {renderActive(step)}
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : onSelectStep && !isCovered ? (
              <button
                type="button"
                onClick={() => onSelectStep(step.key)}
                className={cn(
                  'ds-raw-button flex h-full w-full min-w-0 items-center text-left inset-card',
                  focusRing('control', 'neutral'),
                )}
              >
                {header}
              </button>
            ) : (
              // A covered card is not a control. A button nobody can see or
              // click — but that still takes Tab — is a phantom affordance; the
              // right-edge checklist is where these are reached.
              <div className="flex h-full min-w-0 items-center inset-card">{header}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
