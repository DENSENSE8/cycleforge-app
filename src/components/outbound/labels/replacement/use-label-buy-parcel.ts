'use client';

/**
 * The label-buy Parcel step's state: the typed parcel (prefilled once from the
 * stored parcel — order → SKU → item number — then it is the operator's scale
 * and tape) and the insurance (declared value prefilled once from the order
 * total), plus what still blocks a quote.
 */

import { useEffect, useRef, useState } from 'react';
import type { OrderLabelSummary } from '@/lib/shipping/order-label-summary';
import { parcelComplete } from '@/lib/shipping/replacement-rate-shop';
import type { ParcelDraft, ParcelField } from './ReplacementParcelRow';

/** A typed amount, positive and finite, else null (empty, zero and junk all read "missing"). */
function positiveAmount(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const text = (value: number | null) => (value == null ? '' : String(value));

export function useLabelBuyParcel(
  /** The order's stored parcel; undefined until the label summary loads. */
  stored: OrderLabelSummary['parcel'] | undefined,
  /** The order total; undefined until the price read-out loads, null when it has none. */
  orderTotal: number | null | undefined,
) {
  const [draft, setDraft] = useState<ParcelDraft>({ weight: '', length: '', width: '', height: '' });
  const parcelSeeded = useRef(false);
  useEffect(() => {
    if (!stored || parcelSeeded.current) return;
    parcelSeeded.current = true;
    setDraft({ weight: text(stored.weightOz), length: text(stored.lengthIn), width: text(stored.widthIn), height: text(stored.heightIn) });
  }, [stored]);

  const [insure, setInsure] = useState(false);
  const [declared, setDeclared] = useState('');
  const declaredSeeded = useRef(false);
  useEffect(() => {
    if (orderTotal === undefined || declaredSeeded.current) return;
    declaredSeeded.current = true;
    if (orderTotal != null && orderTotal > 0) setDeclared(String(orderTotal));
  }, [orderTotal]);

  const parcel = {
    weightOz: positiveAmount(draft.weight),
    length: positiveAmount(draft.length),
    width: positiveAmount(draft.width),
    height: positiveAmount(draft.height),
  };
  const declaredValue = positiveAmount(declared);
  const { weightOz, length, width, height } = parcel;
  const complete = weightOz != null && length != null && width != null && height != null ? { weightOz, length, width, height } : null;
  const missing = !parcelComplete(parcel)
    ? weightOz == null
      ? length != null && width != null && height != null
        ? 'Enter the weight'
        : 'Enter weight and L × W × H'
      : 'Enter L × W × H'
    : insure && declaredValue == null
      ? 'Enter the declared value'
      : null;

  return {
    draft,
    setField: (field: ParcelField, value: string) => setDraft((current) => ({ ...current, [field]: value })),
    parcel,
    /** All four measures typed (positive); null while any is missing. */
    complete,
    insure,
    setInsure,
    declared,
    setDeclared,
    /** The declared value when insured and typed, else null. */
    insuredValue: insure ? declaredValue : null,
    /** What still blocks a quote, e.g. "Enter L × W × H"; null when ready. */
    missing,
  };
}
