'use client';

/**
 * @domain-job Resolve an ambiguous Testing scan — choose which of several
 *   candidate receiving lines the bench is about to test.
 * @hardware-target Station
 * @density floor
 * @justification A scan that matches more than one line has to be disambiguated
 *   before any work can start, and the choice is about the ACTIVE ENTITY — which
 *   a Station draws in exactly one region, the middle (`display/station.md` §11).
 *   Until 2026-08-19 this list rendered in the scan column above the recent rail,
 *   which is the anti-pattern that section names outright ("don't put a
 *   browsable, clickable list in the scan column") and put the operator's next
 *   decision in the narrow surface furthest from their work. No existing host
 *   fits: `TestingPanel` renders a line that is already open, and the history
 *   browse underneath is exactly what this must cover.
 */

import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens';
import {
  SerialPreviewStrip,
  BoxMembershipHint,
  serialLast8,
} from '@/components/receiving/SerialPreviewStrip';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
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
      <header className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-4">
        <p className="text-role-eyebrow uppercase tracking-widest text-amber-700">
          Select this first
        </p>
        <h2 className="mt-1 text-lg font-semibold text-text-default">
          {pickHeadline(pick)}
        </h2>
        {pick.value ? (
          <p className="mt-0.5 font-mono text-role-caption text-text-soft">{pick.value}</p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <ul className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {pick.rows.map((row) => (
            <li key={row.id}>
              {/* ds-raw-button: station candidate row (title + qty/status + serial chips) — not the Button primitive shape */}
              <button
                type="button"
                onClick={() => onPick(row)}
                className={`ds-raw-button w-full ${cornerClass('flush')} bg-surface-card px-4 py-3 text-left ring-1 ring-amber-200 transition-colors hover:bg-amber-100`}
              >
                <span className="block truncate text-role-body font-semibold text-text-default">
                  {row.item_name || row.sku || `Line #${row.id}`}
                </span>
                <span className="block text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                  {row.quantity_received}/{row.quantity_expected ?? '?'} ·{' '}
                  {row.workflow_status || 'EXPECTED'}
                  {row.tracking_number
                    ? ` · TRK …${serialLast8(String(row.tracking_number))}`
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
          className="h-auto px-0 text-role-eyebrow uppercase tracking-widest text-amber-600 hover:bg-transparent hover:text-amber-800"
        >
          Cancel — scan again
        </Button>
      </footer>
    </section>
  );
}
