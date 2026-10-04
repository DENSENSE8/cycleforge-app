'use client';

/**
 * The band above the pasted numbers: the pressed status's reason chips, the
 * honest progress line while the Check is still answering and the row-cap
 * note. The triage keys are never painted here — they live in the `?` sheet
 * while the ledger is mounted.
 */

import { useEffect } from 'react';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { INBOUND_FOLLOWUP_LABELS } from '@/lib/receiving/inbound-followups';
import { FOLLOWUP_KEYS } from './cards/pasted-number-faces';
import { IncomingStatusChips, type IncomingStatusChipSet } from './IncomingStatusChips';

const LEGEND: { keys: string[]; label: string }[] = [
  { keys: ['J', 'K'], label: 'walk' },
  { keys: ['↵'], label: 'open' },
  { keys: ['X'], label: 'check' },
  // The follow-up keys, from the one map the ledger's keys read: 1–4 tag, 0 clears last.
  ...Object.entries(FOLLOWUP_KEYS)
    .sort(([a], [b]) => Number(a === '0') - Number(b === '0'))
    .map(([key, tag]) => ({ keys: [key], label: tag ? INBOUND_FOLLOWUP_LABELS[tag].toLowerCase() : 'clear' })),
  // Copy is ⌘/Ctrl+C: bare C is create app-wide (`key-registry`).
  { keys: ['mod', 'C'], label: 'copy' },
  { keys: ['mod', 'alt', 'C'], label: 'copy shown' },
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
  useEffect(() => registerShortcutOverviewGroup({ id: 'pasted-numbers', title: 'Pasted numbers', rows: LEGEND }), []);
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
      </div>
    </div>
  );
}
