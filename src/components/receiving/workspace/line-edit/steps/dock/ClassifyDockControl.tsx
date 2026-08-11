'use client';

/**
 * Dock control for `classify` — one-row Band 1 ACTION (h-11).
 *
 * Unbox unfound: the full editor is KNOW on Displays (`TriageClassifySection`
 * via `railLeaf: 'classify'`). Dock never remounts that stack — growing Band 1
 * shoved Print · Receive off the thumb floor. DO = Continue once
 * {@link isIntakeClassified}; otherwise cue the open Classify Displays leaf.
 *
 * Arrival centre still mounts `TriageClassifySection` under items (different
 * station — no Unbox Displays twin). Do not fork a second classify editor here.
 */

import { useCallback } from 'react';
import { Check, SlidersHorizontal } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { isIntakeClassified } from '@/lib/receiving/triage-intake-kind';
import { useUnboxProcedureSteps } from '../../useUnboxProcedureSteps';
import type { UnboxStepDockContext } from './types';

export function ClassifyDockControl({ row }: UnboxStepDockContext) {
  const { nextNeighbour, focusStep } = useUnboxProcedureSteps(row);
  const classified = isIntakeClassified(row);

  const continueWalk = useCallback(() => {
    if (!classified || !nextNeighbour) return;
    focusStep(nextNeighbour.key);
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  }, [classified, focusStep, nextNeighbour]);

  return (
    // Flush Band 1 segment — fixed h-11 · full width · never expandBand.
    <div
      className="flex h-11 w-full min-w-0 items-stretch gap-0"
      data-unbox-classify-dock
    >
      <Button
        variant="primary"
        size="sm"
        disabled={!classified || !nextNeighbour}
        ariaLabel={
          classified
            ? 'Continue — classification set'
            : 'Classify in Displays — set urgency, platform, and type'
        }
        icon={
          classified ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <SlidersHorizontal className="h-3.5 w-3.5" />
          )
        }
        onClick={continueWalk}
        className="h-full w-full min-w-0 justify-center rounded-none"
      >
        {classified ? 'Continue' : 'Classify in Displays'}
      </Button>
    </div>
  );
}
