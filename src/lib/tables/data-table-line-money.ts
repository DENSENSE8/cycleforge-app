/** Line-money identity — engine law for every PRODUCT_TABLES peer. */

import {
  COMPOUND_MONEY_TONE_CLASS,
  type CompoundSubtitlePart,
} from '@/components/tables/compound/compound-row-model';

/** Empty price face — currency mark, not a generic dash. */
const EMPTY_MONEY_FACE = '$-' as const;

const LINE_MONEY_WIDTH_CH = 8;

function isQtyFieldId(fieldId: string): boolean {
  return fieldId.endsWith('.qty') && !fieldId.endsWith('total_qty');
}

export function isLineMoneyFieldId(fieldId: string | null | undefined): boolean {
  if (!fieldId) return false;
  return fieldId.endsWith('.amount') || fieldId.endsWith('.price');
}


/** Display order: money sits immediately after qty. */
export function pinLineMoneyAfterQty(
  parts: readonly CompoundSubtitlePart[],
): CompoundSubtitlePart[] {
  const qty: CompoundSubtitlePart[] = [];
  const money: CompoundSubtitlePart[] = [];
  const rest: CompoundSubtitlePart[] = [];
  for (const part of parts) {
    if (part.key && isQtyFieldId(part.key)) qty.push(part);
    else if (part.key && isLineMoneyFieldId(part.key)) money.push(part);
    else rest.push(part);
  }
  return money.length > 0 ? [...qty, ...money, ...rest] : [...parts];
}

/** To-ship / Unbox money FACE — green tabular, 8ch, `$-` when empty. */
export function lineMoneySubtitlePart(fieldId: string, text: string | null | undefined): CompoundSubtitlePart {
  const face = String(text ?? '').trim() || EMPTY_MONEY_FACE;
  return {
    text: face,
    toneClass: COMPOUND_MONEY_TONE_CLASS,
    key: fieldId,
    widthCh: LINE_MONEY_WIDTH_CH,
  };
}
