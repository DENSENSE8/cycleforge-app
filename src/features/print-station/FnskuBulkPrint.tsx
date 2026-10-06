'use client';

/**
 * Print station › the FNSKU **Print** popover (owner 2026-10-04): FNSKUs →
 * how many labels of each → Print (directly under the count) → one station.
 * Two openers share it:
 * - the check-set's **Print labels** ({@link FnskuBulkPrint}), anchored under
 *   the select bar the way Repair's Change status is;
 * - a row's hover **Print** at its right edge ({@link FnskuRowPrint}), so one
 *   FNSKU prints without opening its record.
 * Each FNSKU is the same `fnsku` station job the open record's Print sends;
 * this computer prints them here.
 */

import { useRef, useState, type RefObject } from 'react';
import { Printer } from '@/components/Icons';
import { Button, Panel } from '@/design-system/primitives';
import { AnchoredLayer, type AnchoredPlacement } from '@/design-system/primitives/AnchoredLayer';
import { usePrintStations } from '@/hooks/usePrintStations';
import { clampLabelCopies } from '@/lib/print/labelCopies';
import { fnskuConditionMissing, fnskuConditionRequiredMessage, type PrintStationFnskuRow } from '@/lib/print-station/fnsku';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { QuantityPicker } from './FnskuQuantityPicker';
import { StationPicker, resolvePrintStation, stationBlocked } from './StationPicker';

const fnskus = (n: number) => `${n} ${n === 1 ? 'FNSKU' : 'FNSKUs'}`;

/** The popover itself: mounted only while open, so a list of rows never subscribes to the station registry. */
function FnskuPrintPanel({
  rows,
  anchorRef,
  placement,
  onClose,
  onPrinted,
  testId,
}: {
  rows: readonly PrintStationFnskuRow[];
  anchorRef: RefObject<HTMLElement | null>;
  placement: AnchoredPlacement;
  onClose: () => void;
  /** At least one label printed: the list re-reads (Reprinted / recency order). */
  onPrinted: () => void;
  testId: string;
}) {
  const stations = usePrintStations();
  const [copies, setCopies] = useState(1);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const chosen = resolvePrintStation(stations, chosenId);
  const missing = rows.filter((row) => fnskuConditionMissing(row.condition));
  const ready = rows.filter((row) => !fnskuConditionMissing(row.condition));
  const stationBlock = chosen ? stationBlocked(chosen) : 'Choose a print station';
  const conditionBlock = ready.length === 0 ? fnskuConditionRequiredMessage(missing[0]?.fnsku ?? 'This FNSKU') : null;
  const blocked = conditionBlock ?? stationBlock;
  const single = ready.length === 1 ? ready[0]!.fnsku : rows.length === 1 ? rows[0]!.fnsku : null;

  const print = async () => {
    if (!chosen || stationBlock || ready.length === 0) return;
    setSending(true);
    const count = clampLabelCopies(copies);
    let printed = 0;
    // One job per FNSKU that already has a saved condition. A blank one never leaves.
    for (const row of ready) {
      if (chosen.thisComputer) {
        // Lazy, as the record's Print: the local print driver stays out of the page bundle until a label prints here.
        const { printFnskuStationJob } = await import('@/lib/print/printFnskuStationJob');
        const outcome = await printFnskuStationJob({ fnsku: row.fnsku, copies: count }, safeRandomUUID()).catch(() => null);
        if (outcome && outcome.printed > 0 && !outcome.failure) printed += 1;
        if (outcome?.cancelled) break;
      } else if ((await stations.sendFnsku(chosen.stationId, row.fnsku, count)) == null) {
        printed += 1;
      }
    }
    setSending(false);
    const where = chosen.thisComputer ? 'here' : `at ${chosen.stationName}`;
    const each = single && missing.length === 0 ? `${count} ${count === 1 ? 'label' : 'labels'} of ${single}` : null;
    const skipped = missing.length ? ` ${fnskuConditionRequiredMessage(missing.map((row) => row.fnsku).join(', '))}` : '';
    if (printed === ready.length && printed > 0) toast.success(`${each ? `Printing ${each} ${where}` : `Printing ${fnskus(printed)} ${where}, ${count} each`}${skipped ? `.${skipped}` : ''}`);
    else if (printed > 0) toast.error(`${fnskus(printed)} of ${ready.length} sent ${where} — the rest did not print.${skipped}`);
    else toast.error(`${chosen.thisComputer ? 'Nothing printed here' : `${chosen.stationName} did not answer — nothing was printed`}.${skipped}`);
    if (printed > 0) onPrinted();
    onClose();
  };

  const name = single ? `Print ${single}` : `Print ${fnskus(rows.length)}`;
  return (
    <AnchoredLayer open onClose={onClose} anchorRef={anchorRef} placement={placement} level="panelPopover" gap={6}>
      <Panel
        padding="none"
        radius="xl"
        elevation="overlay"
        aria-label={name}
        data-testid={testId}
        className="flex max-h-[var(--anchored-available-height,none)] w-96 flex-col gap-1 py-2"
      >
        <p className="px-4 pt-1 text-role-caption text-text-muted">{single ? 'Labels' : 'Labels of each'}</p>
        <QuantityPicker copies={copies} onCopies={setCopies} disabled={sending} />
        {/* The CTA sits directly under the count (owner 2026-10-04); the stations below scroll when the roster outgrows the viewport. */}
        <div className="flex flex-col items-end gap-1 px-4 pb-2">
          <Button
            variant="primary"
            size="lg"
            radius="control"
            icon={<Printer />}
            loading={sending}
            disabled={Boolean(blocked)}
            onClick={() => void print()}
            data-testid={`${testId}-go`}
          >
            {`Print ${copies * Math.max(ready.length, 1)} ${copies * Math.max(ready.length, 1) === 1 ? 'label' : 'labels'} → ${chosen?.thisComputer ? 'this computer' : (chosen?.stationName ?? '…')}`}
          </Button>
          {conditionBlock ? <p className="text-right text-role-caption text-text-warning">{conditionBlock}</p> : null}
          {!conditionBlock && missing.length > 0 ? (
            <p className="text-right text-role-caption text-text-warning">{fnskuConditionRequiredMessage(missing.map((row) => row.fnsku).join(', '))}</p>
          ) : null}
          {!conditionBlock && stationBlock ? <p className="text-right text-role-caption text-text-warning">{chosen ? `${chosen.stationName}: ${stationBlock}.` : `${stationBlock}.`}</p> : null}
        </div>
        <p className="border-t border-border-hairline px-4 pt-3 text-role-caption text-text-muted">Print at</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StationPicker port={stations} chosenId={chosen?.stationId ?? null} onChoose={setChosenId} disabled={sending} />
        </div>
      </Panel>
    </AnchoredLayer>
  );
}

/** The select bar's **Print labels**: every checked FNSKU, the same count of each. */
export function FnskuBulkPrint({
  rows,
  done,
  onPrinted,
}: {
  rows: readonly PrintStationFnskuRow[];
  /** Morphs the select bar back to its verbs. */
  done: () => void;
  onPrinted: () => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span ref={anchorRef} className="truncate text-role-caption text-text-soft">
        Print {fnskus(rows.length)}
      </span>
      <FnskuPrintPanel rows={rows} anchorRef={anchorRef} placement="bottom-start" onClose={done} onPrinted={onPrinted} testId="fnsku-bulk-print" />
    </>
  );
}

/**
 * A row's **Print** (owner 2026-10-04): the CTA at the row's right edge — the
 * row reveals it on hover / focus — opens the same popover for this one FNSKU,
 * so a label prints without opening the record and travelling to its Print.
 */
export function FnskuRowPrint({ row, onPrinted }: { row: PrintStationFnskuRow; onPrinted: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={anchorRef}
        variant="secondary"
        size="sm"
        icon={<Printer />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Print labels for ${row.fnsku}`}
        onClick={() => setOpen((was) => !was)}
        data-testid="fnsku-row-print"
      >
        Print
      </Button>
      {open ? (
        <FnskuPrintPanel rows={[row]} anchorRef={anchorRef} placement="bottom-end" onClose={() => setOpen(false)} onPrinted={onPrinted} testId="fnsku-row-print-panel" />
      ) : null}
    </>
  );
}
