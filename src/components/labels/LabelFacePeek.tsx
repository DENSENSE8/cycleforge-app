'use client';

/**
 * Hover peek for a small label face (operator 2026-10-07): the station shows
 * the sticker small; hovering (or focusing) it grows the label out of the
 * top-right corner filling the panel — the same HTML face the operator
 * always edited, `slotHits` included, at the width the old Label band had.
 * One face only; unhover folds it back to the sticker.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import type { LabelFaceSlotHandlers } from '@/components/labels/LabelFaceSlotOverlay';
import type { LabelFaceModel } from '@/lib/print/labelFace';
import { cn } from '@/utils/_cn';

export function LabelFacePeek({
  face,
  slotHits,
  children,
}: {
  face: LabelFaceModel;
  /** The real face's edit slots — the grown label edits exactly like the old preview. */
  slotHits?: LabelFaceSlotHandlers;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      data-testid="label-face-peek"
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.div
            className={cn(
              'absolute right-0 top-0 z-dropdown w-[min(32rem,90vw)] origin-top-right bg-surface-card p-3',
              cornerClass('canvas'),
              elevationClass('overlay'),
            )}
            {...motionPresence.labelPeek}
            transition={reduceMotion ? { duration: 0 } : motionTransition.labelPeek}
            data-testid="label-face-peek-panel"
          >
            <LabelFacePreview model={face} embedded fit="host" slotHits={slotHits} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
