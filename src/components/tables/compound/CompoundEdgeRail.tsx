'use client';

/**
 * Slot-table leading-edge rail — reusable across every PRODUCT_TABLES family.
 *
 * Banner: full row height, flush left, 3px. Traveler: 1px core, full banner
 * width, slow ease-in-out on `y`, with a symmetric lighter trail.
 *
 * Travelers share one clock (`edgeMarkTravelY` + rAF time) so every urgent
 * row bobs in the same place at the same time — including after virtualize
 * remounts.
 */

import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from '@/design-system/motion';
import { framerDuration } from '@/design-system/foundations/motion-framer';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { COMPOUND_EDGE_RAIL_CLASS, COMPOUND_ROW_PX } from './compound-row-chrome';
import type { CompoundRowView } from './compound-row-model';
import { edgeMarkTravelY } from './edge-mark-pulse';

const TRAVEL = COMPOUND_ROW_PX - 1;

function SyncedTraveler({ tickClass }: { tickClass?: string }) {
  const y = useMotionValue(0);
  useAnimationFrame((time) => {
    y.set(edgeMarkTravelY(time, TRAVEL, framerDuration.edgeMarkPulse));
  });
  return (
    <motion.span className="absolute inset-x-0 top-0 h-px" style={{ y }}>
      <span className="pointer-events-none absolute inset-x-0 -top-2.5 h-6 bg-gradient-to-b from-transparent via-white/70 to-transparent" />
      <span className={cn('absolute inset-x-0 top-0 h-px', tickClass ?? 'bg-white/90')} />
    </motion.span>
  );
}

export function CompoundEdgeRail({
  mark,
}: {
  mark: NonNullable<CompoundRowView['edgeMark'] | CompoundRowView['importMark']>;
}) {
  const reduce = useReducedMotion();
  const pulse = 'pulse' in mark && Boolean(mark.pulse) && !reduce;
  return (
    <HoverTooltip label={mark.label} asChild focusable={false}>
      <span
        className={cn('absolute inset-y-0 left-0 overflow-hidden', COMPOUND_EDGE_RAIL_CLASS, mark.barClass)}
        data-edge-mark={mark.label}
        aria-hidden
      >
        {pulse ? <SyncedTraveler tickClass={mark.tickClass} /> : null}
      </span>
    </HoverTooltip>
  );
}
