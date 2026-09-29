'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/design-system/motion';
import { MotionPlusListingButton } from './motion-plus-button/MotionPlusListingButton';
import {
  DEMO_PHASE_MS,
  LISTING_BUTTON_VISUAL,
  type ListingButtonPhase,
} from './motion-plus-button/motion-model';

/** Demo harness only: production code drives `phase` from the real async job. */
export function MotionPlusButtonDemo() {
  const [phase, setPhase] = useState<ListingButtonPhase>('idle');
  const timersRef = useRef<number[]>([]);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);

  function runDemo() {
    if (phase !== 'idle') return;
    timersRef.current.forEach(window.clearTimeout);
    setPhase('working');
    timersRef.current = [
      window.setTimeout(
        () => setPhase('done'),
        reduceMotion ? DEMO_PHASE_MS.reducedWorkingToDone : DEMO_PHASE_MS.workingToDone,
      ),
      window.setTimeout(
        () => setPhase('idle'),
        reduceMotion ? DEMO_PHASE_MS.reducedDoneToIdle : DEMO_PHASE_MS.doneToIdle,
      ),
    ];
  }

  return (
    <main className="grid h-full min-h-[28rem] place-items-center overflow-hidden bg-[#f1f0ed] text-black">
      <section className="flex flex-col items-center gap-10" aria-labelledby="motion-plus-demo-title">
        <div className="space-y-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">Motion+ study 01</p>
          <h1 id="motion-plus-demo-title" className="text-balance text-2xl font-medium tracking-[-0.04em]">
            One button. Three states.
          </h1>
          <p className="text-sm text-black/50">Move close, then click.</p>
        </div>

        <MotionPlusListingButton phase={phase} reduceMotion={reduceMotion} onPress={runDemo} />

        <p aria-live="polite" className="h-5 text-xs font-medium text-black/45">
          {LISTING_BUTTON_VISUAL[phase].statusCopy}
        </p>
      </section>
    </main>
  );
}
