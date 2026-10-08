'use client';

/**
 * Print a rack's labels — the phone's Rack → Shelves → Print, on the desk: the
 * placard and every shelf selected, Print (focused; Enter anywhere in the
 * form) runs them through `useLocationLabelPrint` (which records
 * `location.labels.printed`). No room is ever printed. The rack record hosts it
 * in the Print labels verb's centered dialog (`onDone`: a landed print shows
 * the done face); the create flow's last step paints it in place.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Printer } from '@/components/Icons';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { Button, Checkbox, ProgressBar } from '@/design-system/primitives';
import { useLocationLabelPrint } from '@/hooks/useLocationLabelPrint';
import { rackLabelRows } from '@/lib/locations/rack-display';
import type { RackDetail } from '@/lib/locations/rack-types';
import { locationLabelPrintSummary } from '@/lib/print/printLocationRows';
import { toast } from '@/lib/toast';

type RunState =
  | { phase: 'idle' }
  | { phase: 'printing'; done: number; total: number }
  | { phase: 'done'; message: string; ok: boolean };

export function RackPrintPanel({
  rack,
  testId = 'rack-print',
  onDone,
}: {
  rack: RackDetail;
  testId?: string;
  /** Dialog host: a landed print swaps to the done face, whose Done closes. */
  onDone?: () => void;
}) {
  const print = useLocationLabelPrint();
  const [placard, setPlacard] = useState(true);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(rack.shelves.map((s) => s.code)));
  const [run, setRun] = useState<RunState>({ phase: 'idle' });
  const shelves = useMemo(() => [...rack.shelves].sort((a, b) => a.shelf - b.shelf), [rack.shelves]);
  const count = (placard ? 1 : 0) + picked.size;
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (onDone) goRef.current?.focus({ preventScroll: true });
  }, [onDone]);

  const toggle = (code: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const runPrint = async () => {
    if (count === 0 || run.phase === 'printing') return;
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

  // Enter prints from anywhere in the form — a checkbox swallows Enter, a real button presses itself.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.getAttribute('role') !== 'checkbox') return;
    event.preventDefault();
    void runPrint();
  };

  if (onDone && run.phase === 'done' && run.ok) {
    return <VerbDoneState title="Labels printed" detail={run.message} onDone={onDone} testId={`${testId}-done`} />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4" data-testid={testId} onKeyDown={onKeyDown}>
      <RecordGroup title="Labels to print" className="min-h-0 flex-1 overflow-y-auto">
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
        ref={goRef}
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
