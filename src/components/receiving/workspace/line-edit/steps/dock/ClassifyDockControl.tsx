'use client';

/**
 * Dock control for `classify` — one-row Band 1 ACTION (h-11).
 *
 * Unbox unfound: urgency · platform · type are `InlinePillPicker` menus on the
 * **carton identity bar**, one row above the work plane. The Displays Classify
 * leaf was a second editor for those same three fields and was dropped
 * 2026-08-19, so this control cues the bar, not a leaf. The dock never remounts
 * an editor of its own — growing Band 1 shoved Print · Receive off the thumb
 * floor. DO = Continue once {@link isIntakeClassified}.
 *
 * Arrival centre still mounts `TriageClassifySection` under items (different
 * station — its Displays column is Pairing only). Do not fork a second classify
 * editor here.
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
            : 'Set urgency, platform, and type on the carton bar above'
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
        {classified ? 'Continue' : 'Classify above'}
      </Button>
    </div>
  );
}
