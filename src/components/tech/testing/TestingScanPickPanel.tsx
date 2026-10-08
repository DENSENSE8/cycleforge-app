'use client';

/** @domain-job Resolve an ambiguous Testing scan — choose which of several candidate receiving lines the bench is about to test. */

import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens';
import { PHONE_CARD_COLUMN, PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';
import { SerialPreviewStrip, BoxMembershipHint } from '@/components/receiving/SerialPreviewStrip';
import { getLast8 } from '@/lib/copy-chip-format';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';
import type { TestingScanPick } from '@/lib/testing/testing-scan-session-bridge';

/** Amber, because an ambiguous scan is an exception state — not a failure. */
function pickHeadline(pick: TestingScanPick): string {
  const n = pick.rows.length;
  if (pick.via === 'serial') return `${n} serial matches`;
  if (pick.via === 'sku') return `${n} pre-packed lines for this SKU`;
  return `${n} items on this PO`;
}

interface Props {
  pick: TestingScanPick;
  onPick: (row: ReceivingLineRow) => void;
  onCancel: () => void;
}

export function TestingScanPickPanel({ pick, onPick, onCancel }: Props) {
  return (
    <section
      data-testing-picker
      className="flex h-full min-h-0 w-full flex-col bg-surface-canvas"
      aria-label="Select the line to test"
    >
      <div className="shrink-0 px-6 pt-3">
        <header className={`border border-amber-200 bg-amber-50 px-6 py-4 ${PHONE_CARD_FACE}`}>
          <p className="text-role-eyebrow text-amber-700">
            Select this first
          </p>
          <h2 className="mt-1 text-lg font-semibold text-text-default">
            {pickHeadline(pick)}
          </h2>
          {pick.value ? (
            <p className="mt-0.5 font-mono text-role-caption text-text-soft">{pick.value}</p>
          ) : null}
        </header>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <ul className={`flex flex-col gap-2 ${PHONE_CARD_COLUMN}`}>
          {pick.rows.map((row) => (
            <li key={row.id}>
              {/* ds-raw-button: station candidate row (title + qty/status + serial chips) — not the Button primitive shape */}
              <button
                type="button"
                onClick={() => onPick(row)}
                className={`ds-raw-button w-full ${cornerClass('field')} bg-surface-card px-4 py-3 text-left ring-1 ring-amber-200 transition-colors hover:bg-amber-100`}
              >
                <span className="block truncate text-role-body font-semibold text-text-default">
                  {row.item_name || row.sku || `Line #${row.id}`}
                </span>
                <span className="block text-role-eyebrow font-semibold text-text-soft">
                  {row.quantity_received}/{row.quantity_expected ?? '?'} ·{' '}
                  {workflowStageLabel(row.workflow_status || 'EXPECTED')}
                  {row.tracking_number
                    ? ` · TRK …${getLast8(String(row.tracking_number))}`
                    : ''}
                </span>
                {row.serials && row.serials.length > 0 ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1">
                    <SerialPreviewStrip serials={row.serials} />
                    <BoxMembershipHint serials={row.serials} />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="shrink-0 border-t border-border-hairline px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-auto px-0 text-role-eyebrow text-amber-600 hover:bg-transparent hover:text-amber-800"
        >
          Cancel — scan again
        </Button>
      </footer>
    </section>
  );
}
