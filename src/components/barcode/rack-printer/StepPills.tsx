import React, { useRef } from 'react';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { noPad, pad2 } from '@/lib/barcode-routing';
import { LABEL_BUILDER_STEP } from '../label-builder-layout';
import { STEPS, type Step } from './rack-printer-config';

/**
 * Callers: RackBuilderDesktop/Mobile. No data schemas.
 * User: "tabs and the pills are from different tokens" / "Displayed per use case."
 * Path chips use LABEL_BUILDER_STEP (blue surface) — not TabSwitch.
 */

interface StepPillsProps {
  activeStep: Step;
  zoneLetter?: string;
  roomName?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  onPillClick: (step: Step) => void;
}

/** Bay location path chips — LABEL_BUILDER_STEP, not TabSwitch. */
export function StepPills({
  activeStep,
  zoneLetter,
  roomName,
  aisle,
  bay,
  level,
  onPillClick,
}: StepPillsProps) {
  const values: Record<Step, string | undefined> = {
    zone: zoneLetter,
    aisle: aisle != null ? pad2(aisle) : undefined,
    bay: bay != null ? pad2(bay) : undefined,
    level: level != null ? noPad(level) : undefined,
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  useHorizontalWheelScroll(scrollRef);

  return (
    <div
      ref={scrollRef}
      className={LABEL_BUILDER_STEP.track}
      role="navigation"
      aria-label="Bay location steps"
    >
      <div className="flex w-max max-w-none flex-none flex-nowrap items-center gap-1">
        {STEPS.map(({ id, label }, idx) => {
          const value = values[id];
          const isDone = !!value;
          const isActive = activeStep === id;
          const isClickable = isDone || isActive;
          const showChevron = idx < STEPS.length - 1;
          const tip = id === 'zone' && roomName ? roomName : '';
          const pill = (
            <button
              type="button"
              onClick={() => onPillClick(id)}
              disabled={!isClickable}
              aria-current={isActive ? 'step' : undefined}
              className={`${LABEL_BUILDER_STEP.chipBase} ${
                isActive
                  ? LABEL_BUILDER_STEP.chipActive
                  : isDone
                    ? LABEL_BUILDER_STEP.chipDone
                    : LABEL_BUILDER_STEP.chipIdle
              }`}
            >
              <span className="text-role-micro opacity-80">{label}</span>
              <span className="font-mono text-role-micro font-semibold tabular-nums">{value ?? '—'}</span>
            </button>
          );
          return (
            <React.Fragment key={id}>
              {tip ? (
                <HoverTooltip label={tip} asChild>
                  {pill}
                </HoverTooltip>
              ) : (
                pill
              )}
              {showChevron && (
                <span className="shrink-0 px-0.5 text-role-micro text-text-faint" aria-hidden>
                  ›
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
