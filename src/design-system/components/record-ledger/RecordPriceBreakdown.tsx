/**
 * A record's money, under its items: ONE hairline, then a right-aligned
 * breakdown (Items · Shipping · Tax · … · Paid / Total, the last row heavy).
 * The outbound order record and the inbound purchase read their price the
 * same way (owner 2026-09-29). Presentational — the host computes the rows.
 */

import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

export interface RecordPriceRow {
  label: string;
  /** Negative = a debit (label cost); null = unknown. */
  value: number | null;
}

export function RecordPriceBreakdown({
  rows,
  unreadable = false,
  format = formatCurrency,
  testId,
}: {
  rows: readonly RecordPriceRow[];
  unreadable?: boolean;
  /** Money face — the record's currency. */
  format?: (value: number) => string;
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 justify-end border-t border-mode-edge px-4 py-3" data-testid={testId}>
      <div className="w-full max-w-72">
        {unreadable ? (
          <p className={cn(RECORD_ID_CLASS, 'text-right text-mode-warn')}>Unreadable</p>
        ) : rows.length === 0 ? (
          <p className={cn(RECORD_ID_CLASS, 'text-right text-mode-muted')}>—</p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1">
            {rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="contents">
                <dt className={cn(RECORD_LABEL_CLASS, 'text-right text-mode-muted')}>{row.label}</dt>
                <dd
                  className={cn(
                    RECORD_ID_CLASS,
                    'min-w-20 text-right',
                    row.value != null && row.value < 0
                      ? STATE_TONE_CLASSES.danger.text
                      : row.value == null
                        ? 'text-mode-muted'
                        : RECORD_PRICE_CLASS,
                    index === rows.length - 1 && 'font-black',
                  )}
                >
                  {row.value == null ? '—' : row.value < 0 ? debit(Math.abs(row.value), format) : format(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** A cost the total subtracts, painted as a debit. */
function debit(value: number, format: (value: number) => string): string {
  return value === 0 ? format(0) : `−${format(value)}`;
}
