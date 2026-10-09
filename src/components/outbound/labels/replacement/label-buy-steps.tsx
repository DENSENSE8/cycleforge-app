/**
 * The label-buy stepper's model: the five steps, each step's footer verb (+
 * the hint of what blocks it), and which Enter presses move a step on.
 * `ReplacementForm` owns the state; this decides what the bottom row says.
 *
 *   1 Ship to — labels so far + the ship-to (editable); replacement: reason,
 *     note and the stub-merge offer
 *   2 Parcel  — oz + L × W × H, insurance; Get rates is the Next
 *   3 Rate    — carrier chips / sort / coverage over the rate rows, which own
 *     all the remaining height
 *   4 Confirm — the chosen rate, parcel, ship-to (+ reason); Confirm & buy
 *   5 Done    — the bought label (print, slip, download, void)
 */

import type { KeyboardEvent } from 'react';
import { ArrowRight, Check, RefreshCw, Truck } from '@/components/Icons';
import type { MobileStepProgressStep } from '@/design-system/components/MobileStepProgress';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import { rateTotal } from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import type { LabelBuyStepVerb } from './LabelBuyStepFooter';

export type LabelBuyStepId = 'shipTo' | 'parcel' | 'rate' | 'confirm' | 'done';

export const LABEL_BUY_STEPS: readonly (MobileStepProgressStep & { id: LabelBuyStepId })[] = [
  { id: 'shipTo', label: 'Ship to' },
  { id: 'parcel', label: 'Parcel' },
  { id: 'rate', label: 'Rate' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'done', label: 'Done' },
];

export interface LabelBuyFooterModel {
  verb: LabelBuyStepVerb;
  hint: string | null;
  /** The hint says the quote is out of date. */
  warning: boolean;
  error: string | null;
}

const STALE_HINT = 'Changed since the quote — rates are out of date';

export function labelBuyFooter(input: {
  step: LabelBuyStepId;
  noun: string;
  /** What blocks leaving Ship to (loading, no address, no reason); null when ready. */
  shipToBlock: string | null;
  /** What blocks a quote (parcel, declared value); null when ready. */
  parcelMissing: string | null;
  quoted: boolean;
  stale: boolean;
  quoting: boolean;
  quoteError: string | null;
  selectedRate: ShippingRateOption | null;
  buying: boolean;
  buyError: string | null;
  go: (step: LabelBuyStepId) => void;
  getRates: () => void;
  buy: (rate: ShippingRateOption) => void;
  done: () => void;
}): LabelBuyFooterModel {
  const { step, noun, quoted, stale, selectedRate, go } = input;
  const next = (to: LabelBuyStepId, disabled = false): LabelBuyStepVerb => ({
    label: 'Next',
    icon: <ArrowRight />,
    onClick: () => go(to),
    disabled,
    testId: 'label-buy-next',
  });
  const quote: LabelBuyFooterModel = {
    verb: {
      label: quoted ? 'Refresh rates' : 'Get rates',
      icon: quoted ? <RefreshCw /> : <Truck />,
      onClick: input.getRates,
      disabled: input.parcelMissing != null,
      loading: input.quoting,
      testId: 'send-replacement-get-rates',
    },
    hint: input.parcelMissing ?? (stale ? STALE_HINT : null),
    warning: input.parcelMissing == null && stale,
    error: input.quoteError,
  };
  switch (step) {
    case 'shipTo':
      return { verb: next('parcel', input.shipToBlock != null), hint: input.shipToBlock, warning: false, error: null };
    case 'parcel':
      return quoted && !stale ? { verb: next('rate'), hint: null, warning: false, error: null } : quote;
    case 'rate':
      if (stale) return quote;
      return {
        verb: {
          label: selectedRate ? `Buy ${formatMoney(rateTotal(selectedRate), selectedRate.currency)} ${noun}` : `Buy ${noun}`,
          icon: <Truck />,
          onClick: () => go('confirm'),
          disabled: selectedRate == null,
          testId: 'send-replacement-buy',
        },
        hint: selectedRate ? null : 'Pick a rate to buy.',
        warning: false,
        error: null,
      };
    case 'confirm':
      return {
        verb: {
          label: 'Confirm & buy',
          icon: <Check />,
          onClick: () => selectedRate && input.buy(selectedRate),
          disabled: stale || selectedRate == null,
          loading: input.buying,
          autoFocus: true,
          testId: 'send-replacement-confirm-buy',
        },
        hint: stale ? 'Refresh rates before buying.' : null,
        warning: stale,
        error: input.buyError,
      };
    case 'done':
      return { verb: { label: 'Done', icon: <Check />, onClick: input.done, testId: 'label-buy-done' }, hint: null, warning: false, error: null };
  }
}

/** Elements whose Enter is their own (newline, open, follow) — never the step's verb. */
const ENTER_OWNING_TAGS: Readonly<Record<string, true>> = { TEXTAREA: true, SELECT: true, A: true };

/**
 * Does this Enter press mean "the step's verb"? Text areas keep their newline,
 * a button presses itself (except the picked rate row: Enter again moves on),
 * and a field submits only from the parcel block (`data-label-buy-parcel`)
 * while a quote is owed — the ship-to editor owns its own Enter.
 */
export function enterMovesOn(event: KeyboardEvent<HTMLElement>, step: LabelBuyStepId): boolean {
  if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing) return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || step === 'done') return false;
  const target = event.target as HTMLElement;
  if (target.isContentEditable || ENTER_OWNING_TAGS[target.tagName]) return false;
  if (target.tagName === 'BUTTON') return target.getAttribute('role') === 'radio' && target.getAttribute('aria-checked') === 'true';
  if (target.tagName === 'INPUT') return step === 'parcel' && target.closest('[data-label-buy-parcel]') != null;
  return true;
}
