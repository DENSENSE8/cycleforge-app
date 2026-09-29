'use client';

/**
 * The band above the pasted numbers: the pressed status's reason chips, the
 * honest progress line while the Check is still answering, the row-cap note,
 * and the triage keys (the popout footer's legend, on the ledger).
 */

import { KeyboardKey } from '@/design-system/primitives';
import { IncomingStatusChips, type IncomingStatusChipSet } from './IncomingStatusChips';

const LEGEND: readonly { keys: readonly string[]; label: string }[] = [
  { keys: ['J', 'K'], label: 'walk' },
  { keys: ['↵'], label: 'open' },
  { keys: ['X'], label: 'check' },
  { keys: ['C'], label: 'copy' },
  { keys: ['⇧C'], label: 'copy shown' },
  { keys: ['R'], label: 'recheck' },
  { keys: ['⌫'], label: 'remove' },
];

export function PastedNumbersBanner({
  reasons,
  checking,
  pasted,
  answered,
  notice,
}: {
  reasons: IncomingStatusChipSet | null;
  /** A Check round (or a recheck) is still out. */
  checking: boolean;
  pasted: number;
  answered: number;
  notice: string | null;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 px-4 pb-1" data-testid="pasted-numbers-banner">
      {reasons ? <IncomingStatusChips set={reasons} /> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {checking ? (
          <p role="status" data-testid="pasted-numbers-progress" className="font-semibold tabular-nums text-text-default">
            Checking {pasted.toLocaleString()} {pasted === 1 ? 'number' : 'numbers'} · {answered.toLocaleString()} answered
          </p>
        ) : null}
        {notice ? (
          <p role="status" data-testid="incoming-notice" className="font-semibold text-text-warning">
            {notice}
          </p>
        ) : null}
        <span
          aria-label="Keys"
          data-testid="pasted-numbers-legend"
          className="ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 text-role-micro text-text-faint"
        >
          {LEGEND.map(({ keys, label }) => (
            <span key={label} className="inline-flex items-center gap-1">
              {keys.map((key) => (
                <KeyboardKey key={key} size="xs">
                  {key}
                </KeyboardKey>
              ))}
              {label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
