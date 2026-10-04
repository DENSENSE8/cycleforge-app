'use client';

/**
 * Print a rack's labels — the phone's Rack → Shelves → Print, on the desk: the
 * placard and every shelf selected, "Arrival shelves only" narrows to the
 * tiered ones, Print runs them through `useLocationLabelPrint` (which records
 * `location.labels.printed`). No room is ever printed.
 */

import { useMemo, useState } from 'react';
import { Printer } from '@/components/Icons';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { Button, Checkbox, ProgressBar } from '@/design-system/primitives';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { rackLabelRows } from '@/lib/locations/rack-display';
import type { RackDetail } from '@/lib/locations/rack-types';
import { locationLabelPrintSummary } from '@/lib/print/printLocationRows';
import { arrivalTierLabel } from '@/lib/receiving/arrival-tier';
import { toast } from '@/lib/toast';

type RunState =
  | { phase: 'idle' }
  | { phase: 'printing'; done: number; total: number }
  | { phase: 'done'; message: string; ok: boolean };

export function RackPrintPanel({ rack, testId = 'rack-print' }: { rack: RackDetail; testId?: string }) {
  const print = useLocationLabelPrint();
  const [placard, setPlacard] = useState(true);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(rack.shelves.map((s) => s.code)));
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const shelves = useMemo(() => [...rack.shelves].sort((a, b) => a.shelf - b.shelf), [rack.shelves]);
  const tiered = shelves.filter((s) => s.tier != null);
  const arrivalOnly = !placard && tiered.length > 0 && picked.size === tiered.length && tiered.every((s) => picked.has(s.code));
  const count = (placard ? 1 : 0) + picked.size;

  const toggle = (code: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const runPrint = async () => {
    const rows = rackLabelRows(rack, { placard, shelfCodes: picked });
    setRun({ phase: 'printing', done: 0, total: rows.length });
    try {
      const result = await print(rows, (done, total) => setRun({ phase: 'printing', done, total }));
      const message = locationLabelPrintSummary(result);
      setRun({ phase: 'done', message, ok: result.transport !== 'skipped' });
      if (result.transport === 'skipped') toast.error(message);
    } catch (err) {
      setRun({ phase: 'done', message: err instanceof Error ? err.message : 'Print failed', ok: false });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid={testId}>
      <RecordGroup
        title="Labels to print"
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={tiered.length === 0}
            aria-pressed={arrivalOnly}
            onClick={() => {
              if (arrivalOnly) {
                setPlacard(true);
                setPicked(new Set(shelves.map((s) => s.code)));
              } else {
                setPlacard(false);
                setPicked(new Set(tiered.map((s) => s.code)));
              }
            }}
            data-testid={`${testId}-arrival-only`}
          >
            {tiered.length === 0 ? 'No arrival shelves' : arrivalOnly ? 'All labels' : 'Arrival shelves only'}
          </Button>
        }
      >
        <ul className="flex flex-col px-4 pb-2">
          <li className="flex items-center gap-3 border-b border-mode-fact py-2">
            <Checkbox
              id={`${testId}-placard`}
              checked={placard}
              onCheckedChange={(v) => setPlacard(v === true)}
              aria-label={`Rack placard ${rack.code}`}
            />
            <label htmlFor={`${testId}-placard`} className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-role-data text-mode-ink">
              <span className="font-semibold">Rack placard</span>
              <span className="font-mono text-mode-muted">{rack.code}</span>
            </label>
          </li>
          {shelves.map((shelf) => (
            <li key={shelf.id} className="flex items-center gap-3 border-b border-mode-fact py-2 last:border-b-0">
              <Checkbox
                id={`${testId}-${shelf.code}`}
                checked={picked.has(shelf.code)}
                onCheckedChange={(v) => toggle(shelf.code, v === true)}
                aria-label={`Shelf ${shelf.shelf} ${shelf.code}`}
              />
              <label htmlFor={`${testId}-${shelf.code}`} className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-role-data text-mode-ink">
                <span className="font-semibold">Shelf {shelf.shelf}</span>
                <span className="font-mono text-mode-muted">{shelf.code}</span>
                {shelf.tier != null ? <span className="text-text-info">Arrival · {arrivalTierLabel(shelf.tier)}</span> : null}
              </label>
            </li>
          ))}
        </ul>
      </RecordGroup>
      {run.phase === 'printing' ? (
        <ProgressBar current={run.done} goal={run.total} label="Printing labels" showRemaining={false} />
      ) : run.phase === 'done' ? (
        <EvidenceNotice tone={run.ok ? undefined : 'warn'}>{run.message}</EvidenceNotice>
      ) : null}
      <Button
        variant="primary"
        icon={<Printer aria-hidden />}
        loading={run.phase === 'printing'}
        disabled={count === 0}
        onClick={() => void runPrint()}
        data-testid={`${testId}-go`}
      >
        {count === 0 ? 'Choose labels to print' : `Print ${count} ${count === 1 ? 'label' : 'labels'}`}
      </Button>
    </div>
  );
}
