'use client';

/**
 * The label-buy form's two faces (operator 2026-10-08: "details on the left
 * side and buying the label on the right side — keep the stepper for phone"):
 *
 * - desk: details (ship-to, parcel, insurance; replacement: reason + stub
 *   merge) scroll on the left; the buy — rates, confirm, the bought label —
 *   owns the right with the one verb at its foot.
 * - phone: one step at a time under the house {@link MobileStepProgress} bar,
 *   the step's verb at the bottom.
 *
 * A shell only: `ReplacementForm` builds every part once and hands them here.
 */

import type { KeyboardEvent, ReactNode } from 'react';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { ScrollPane, Spinner } from '@/design-system/primitives';
import { LABEL_BUY_STEPS, type LabelBuyStepId } from './label-buy-steps';

export interface LabelBuyParts {
  /** Labels so far + ship-to (+ reason, for a replacement). */
  facts: ReactNode;
  /** Parcel + insurance. */
  parcel: ReactNode;
  stubMerge: ReactNode;
  /** The rate shop — pins its own filters over its own scroll area. */
  rates: ReactNode;
  confirm: ReactNode;
  bought: ReactNode;
  /** True while the first quote is in flight. */
  quoting: boolean;
  orderRef: string;
}

/** A scrolling body for every view but the rate shop. */
function Pane({ children }: { children: ReactNode }) {
  return <ScrollPane className="flex flex-col gap-5 border-t border-border-hairline px-5 py-4">{children}</ScrollPane>;
}

export function LabelBuyFace({
  phone,
  step,
  onStepPress,
  onKeyDown,
  parts,
  footer,
}: {
  phone: boolean;
  /** Phone: the step in view. Desk: where the buy stands (parcel = no quote yet). */
  step: LabelBuyStepId;
  /** Phone only; absent while a buy is in flight or landed — nothing goes back then. */
  onStepPress?: (step: LabelBuyStepId) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  parts: LabelBuyParts;
  footer: ReactNode;
}) {
  if (!phone) {
    return (
      <div className="flex min-h-0 flex-1" onKeyDown={onKeyDown} data-testid="label-buy-desk" data-step={step}>
        <ScrollPane className="flex w-2/5 flex-none flex-col gap-5 border-r border-border-hairline px-5 py-4">
          {parts.facts}
          {parts.parcel}
          {parts.stubMerge}
        </ScrollPane>
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Buy the label">
          {step === 'rate' ? (
            parts.rates
          ) : (
            <Pane>
              {step === 'done' ? (
                parts.bought
              ) : step === 'confirm' ? (
                parts.confirm
              ) : parts.quoting ? (
                <p className="flex items-center gap-2 text-role-caption text-text-soft">
                  <Spinner size="sm" /> Fetching live rates…
                </p>
              ) : (
                <p className="text-role-caption text-text-faint">
                  Live carrier rates for {parts.orderRef} land here — complete the parcel on the left, then Get rates.
                </p>
              )}
            </Pane>
          )}
          {footer}
        </section>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} data-testid="label-buy-stepper" data-step={step}>
      <div className="shrink-0 pt-2">
        <MobileStepProgress
          steps={LABEL_BUY_STEPS}
          currentIndex={LABEL_BUY_STEPS.findIndex((s) => s.id === step)}
          onStepPress={onStepPress ? (index) => onStepPress(LABEL_BUY_STEPS[index].id) : undefined}
          testId="label-buy-steps"
        />
      </div>
      {step === 'rate' ? (
        parts.rates
      ) : (
        <Pane>
          {step === 'shipTo' ? (
            <>
              {parts.facts}
              {parts.stubMerge}
            </>
          ) : step === 'parcel' ? (
            parts.parcel
          ) : step === 'confirm' ? (
            parts.confirm
          ) : (
            parts.bought
          )}
        </Pane>
      )}
      {footer}
    </div>
  );
}
