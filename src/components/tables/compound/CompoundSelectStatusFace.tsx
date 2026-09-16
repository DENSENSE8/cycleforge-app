'use client';

/**
 * The RESTING face of the select gutter — the row's status where the selection
 * square will be.
 *
 * Operator 2026-09-15: "on hover it will display the checklist icon, on
 * non-hover it will display the current status of the order … if the order is
 * urgent then it will display a flashing lightning bolt". So the 16px box has
 * two altitudes and the pointer chooses between them:
 *
 * - **at rest** — these glyphs, from {@link compoundSelectStatusMarks}.
 * - **row hovered / keyboard focus on the checkbox / no-hover pointer** — the
 *   selection square ({@link GridSelectSquareFace}), which paints itself in
 *   exactly those conditions. This face fades out under the same three, so the
 *   two never overlap and neither has to know about the other's timing.
 *
 * A TICKED row is not a resting row: membership has to be readable straight
 * down the column, so the caller drops this face entirely once `checked` is
 * true or mixed and the accent square stands alone.
 *
 * ## Several marks TAKE TURNS in the one box
 *
 * An urgent order that is also short carries two marks, and the box alternates
 * between them on the shared clock (operator 2026-09-15: "it should flash
 * between out of stock Alert icon and the is-urgent lightning bolt"). Every
 * mark is a layer in the same 16px square and `edgeMarkFlashOpacity` gives each
 * its slot, so only one is ever visible and the glyph never jumps position.
 * Two glyphs side by side would need a wider track; a single "worst" mark would
 * hide the other fact. Under reduced motion there is no rotation to watch, so
 * the HOTTEST mark stands alone and still.
 *
 * ## Why it is decorative
 *
 * `aria-hidden`, no tooltip. It is the one face an operator can never point at
 * — reaching for it replaces it — so a hover label would be unreachable by
 * construction. The fact is already spoken twice: the edge rail carries
 * `mark.label` on its own tooltip, and the item track paints the same product
 * flag with an `sr-only` word beside the title. A third announcement of
 * "Urgent" on the same row is noise for a screen reader.
 *
 * ## Geometry is the HOST's
 *
 * Where the 16px box sits inside the gutter is decided by the host, and the
 * host hands those same classes to BOTH planes (`items-center` plus the rail
 * inset, `COMPOUND_GUTTER_RAIL_INSET_CLASS`) — this file re-deriving them is
 * how a glyph starts jumping on hover. Operator 2026-09-15: centred in the
 * middle, which on a 24px track means centred in what the 3px rail leaves.
 */

import type { ReactNode } from 'react';
import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from '@/design-system/motion';
import { framerDuration } from '@/design-system/foundations/motion-framer';
import { AlertTriangle, Clock, Zap } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import type { CompoundSelectStatus } from './compound-select-status';
import { edgeMarkFlashOpacity } from './edge-mark-pulse';

/**
 * HALF the rail's bob period — phase-locked to it (both read the same rAF
 * clock), but a flash rather than a breath. Derived, so the pair can never be
 * retuned apart.
 */
const FLASH_SEC = framerDuration.edgeMarkPulse / 2;

/**
 * The mark's BOX is the 16px square's box and the glyph is 14px inside it — the
 * same optical weight as the rail tick, and the same outer box the checklist
 * square wears so the two faces cannot land on different lines when the host
 * pins them (`COMPOUND_GUTTER_MARK_TOP_PIN_CLASS`: both at cy = rowTop + 12).
 */
const BOX_CLASS = 'h-4 w-4';
const GLYPH_CLASS = 'h-3.5 w-3.5';

/**
 * The glyph each mark wears. Urgent is the bolt (time), attention is the
 * triangle (this cannot ship) — the same triangle the item track paints beside
 * the title, so the two marks on one row agree.
 */
const GLYPH: Record<CompoundSelectStatus['kind'], (props: { className?: string }) => ReactNode> = {
  urgent: Zap,
  attention: AlertTriangle,
  imported: Clock,
};

/** Ink per mark — warning for time, danger for cannot-ship, accent for freshness. */
const INK: Record<CompoundSelectStatus['kind'], string> = {
  urgent: 'text-text-warning',
  attention: 'text-text-danger',
  imported: 'text-[var(--ds-color-text-accent)]',
};

function MarkLayer({
  mark,
  index,
  count,
  animate,
}: {
  mark: CompoundSelectStatus;
  index: number;
  count: number;
  animate: boolean;
}) {
  const Glyph = GLYPH[mark.kind];
  const opacity = useMotionValue(1);
  // Opacity only, driven off the shared clock — no React re-render per frame,
  // and no per-mount `animate` for a virtualized row to drift on. Every bolt
  // and every red triangle on screen therefore flashes, and rotates, as one.
  useAnimationFrame((time) => {
    if (!animate) return;
    opacity.set(edgeMarkFlashOpacity(time, FLASH_SEC, index, count));
  });
  return (
    <motion.span
      data-select-status-face={mark.kind}
      className={cn('absolute inset-0 flex items-center justify-center', INK[mark.kind])}
      style={animate ? { opacity } : undefined}
    >
      <Glyph className={GLYPH_CLASS} />
    </motion.span>
  );
}

export function CompoundSelectStatusFace({
  statuses,
  /** The host's own alignment classes for the 16px face. */
  className,
}: {
  /** Heat-ordered marks for this row — see {@link compoundSelectStatusMarks}. */
  statuses: readonly CompoundSelectStatus[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  // No rotation to watch under reduced motion, so the hottest mark stands alone
  // rather than several layers painting on top of each other.
  const marks = reduce ? statuses.slice(0, 1) : statuses;
  if (marks.length === 0) return null;
  return (
    <span
      aria-hidden
      data-select-status-marks={marks.length}
      className={cn(
        // Covers the gutter and aligns like the square; never takes a click —
        // the whole cell stays the checkbox's hit plane.
        'pointer-events-none absolute inset-0 flex justify-center transition-opacity',
        // Reaching for the row hands the box back to selection.
        'group-hover/row:opacity-0 group-focus-visible/select:opacity-0',
        // Touch / pen: the square stands permanently, so this never paints.
        '[@media(hover:none)]:opacity-0',
        className,
      )}
    >
      {/* The 16px box every mark shares — layers stack, the glyph never moves. */}
      <span className={cn('relative', BOX_CLASS)}>
        {marks.map((mark, index) => (
          <MarkLayer
            key={mark.kind}
            mark={mark}
            index={index}
            count={marks.length}
            // A lone mark animates when its family asked it to; a PAIR must
            // animate regardless, or the second layer would paint permanently
            // over the first instead of taking turns.
            animate={!reduce && (marks.length > 1 || mark.flash)}
          />
        ))}
      </span>
    </span>
  );
}
