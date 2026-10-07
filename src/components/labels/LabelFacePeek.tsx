'use client';

/**
 * Hover peek for a small label face (operator 2026-10-07): the station shows
 * the sticker small; hovering (or focusing) it grows a big face out of the
 * top-right corner, with the true 2 × 1 in size beside it so the operator
 * sees both what it says and how big it really prints.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { LabelFacePreview } from '@/design-system/components/LabelFacePreview';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import type { LabelFaceModel } from '@/lib/print/labelFace';
import { cn } from '@/utils/_cn';

/** The big face's cap — readable from arm's length, still inside the panel. */
const PEEK_SCALE = 2.5;

export function LabelFacePeek({ face, children }: { face: LabelFaceModel; children: ReactNode }) {
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
              'absolute right-0 top-0 z-dropdown flex w-lg origin-top-right flex-col gap-3 bg-surface-card p-4',
              cornerClass('canvas'),
              elevationClass('overlay'),
            )}
            {...motionPresence.labelPeek}
            transition={reduceMotion ? { duration: 0 } : motionTransition.labelPeek}
            data-testid="label-face-peek-panel"
          >
            <LabelFacePreview model={face} embedded fit="capped" maxScale={PEEK_SCALE} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-role-caption text-text-muted">Actual size · 2 × 1 in</span>
              <div className="w-48 shrink-0">
                <LabelFacePreview model={face} embedded fit="capped" maxScale={1} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
