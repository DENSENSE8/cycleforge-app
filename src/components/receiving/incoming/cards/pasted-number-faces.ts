/**
 * Paint faces for a pasted number's sheet-row facts — shared by the Full
 * card and the Compact row so both say the same words (Law 2: one painter
 * per display type).
 */

import type { RecordFactFace } from '@/design-system/components/record-card/record-fact';
import type { StateName } from '@/design-system/tokens/lifecycle';
import { fmtDate } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { INBOUND_FOLLOWUP_LABELS, type InboundFollowup, type InboundFollowupTag } from '@/lib/receiving/inbound-followups';
import {
  carrierFactText,
  shortDay,
  type PastedCarrierFact,
  type PastedNumberFacts,
} from '@/lib/receiving/pasted-number-facts';
import { formatCurrency } from '@/utils/_number';

/** The carrier's last word as a fact face — the words are {@link carrierFactText} (`brief` for the Compact row), the ink follows the kind. */
export function carrierFace(fact: PastedCarrierFact, brief = false): RecordFactFace | null {
  const text = carrierFactText(fact, brief);
  if (!text) return null;
  if (fact.kind === 'eta') return { kind: 'date', text, title: `Carrier estimate ${fmtDate(fact.at)}` };
  if (fact.kind === 'attempted' || fact.kind === 'no_tracking') return { kind: 'missing', text };
  return { kind: 'text', text };
}

/** "Ordered Sep 23 · 10d" — the sheet's PO date, with the age it never showed. */
export function orderedFace(ordered: PastedNumberFacts['ordered']): RecordFactFace | null {
  if (!ordered) return null;
  return {
    kind: 'date',
    text: `${shortDay(ordered.at)} · ${ordered.ageDays}d`,
    title: `Ordered ${fmtDate(ordered.at)} — ${ordered.ageDays} day${ordered.ageDays === 1 ? '' : 's'} ago`,
  };
}

/** Σ price × qty; a total missing a line's price wears "~". */
export function totalFace(total: PastedNumberFacts['total']): RecordFactFace {
  if (!total) return { kind: 'money', text: null, estimate: false, estimateTitle: '' };
  return {
    kind: 'money',
    text: formatCurrency(total.dollars),
    estimate: total.partial,
    estimateTitle: 'A line has no price on file — the total is a floor',
  };
}

/** Each follow-up's ink: a claim cannot wait, a check or a chase is in hand, an acknowledgement is settled. */
export const FOLLOWUP_TONE: Readonly<Record<InboundFollowupTag, StateName>> = {
  need_claim: 'danger',
  double_check: 'warning',
  chasing_seller: 'warning',
  acknowledged: 'success',
};

/** "Need claim — Ana, Oct 3: box crushed" — the hover on a tagged number. */
export function followupTip(followup: InboundFollowup): string {
  const who = followup.setByName ? `${followup.setByName}, ` : '';
  return `${INBOUND_FOLLOWUP_LABELS[followup.tag]} — ${who}${fmtDate(followup.setAt, 'MMM d, h:mma')}${followup.note ? `: ${followup.note}` : ''}`;
}

/** Number keys for the four tags (0 clears) — the ledger's keys and its legend read this one map. */
export const FOLLOWUP_KEYS: Readonly<Record<string, InboundFollowupTag | null>> = {
  '1': 'need_claim',
  '2': 'double_check',
  '3': 'chasing_seller',
  '4': 'acknowledged',
  '0': null,
};
