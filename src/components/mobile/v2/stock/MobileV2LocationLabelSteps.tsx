'use client';

/**
 * The three step bodies of `/m/stock/labels` (MobileV2LocationLabelFlow):
 * Rack cards, Shelves (the rack's placard and shelves as selectable record
 * cards, "Arrival shelves only"), Print (what goes out, progress, result).
 * Text wraps, never truncates. No room is a step — the rack card names where
 * it stands as a fact.
 */

import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { Button, ProgressBar, Switch } from '@/design-system/primitives';
import { rackPlacementText } from '@/lib/locations/rack-display';
import type { RackDetail, RackSummary } from '@/lib/locations/rack-types';
import { locationLabelPrintSummary, type PrintLocationRowsResult } from '@/lib/print/printLocationRows';
import { plural, rackShelvesLine, rackTierStatus, shelfTierStatus } from '@/components/mobile/v2/racks/rack-presentation';
import { labelChoices, PLACARD_KEY, shownLabelKeys } from './location-label-flow-model';

function Quiet({ children, alert = false }: { children: string; alert?: boolean }) {
  return alert ? (
    <p role="alert" className="break-words px-mode-page py-10 text-center text-role-caption font-semibold text-text-danger">{children}</p>
  ) : (
    <p className="break-words px-mode-page py-10 text-center text-role-caption text-text-muted">{children}</p>
  );
}

export function LabelRackStep({
  racks,
  loading,
  error,
  onPick,
}: {
  racks: readonly RackSummary[];
  loading: boolean;
  error: string | null;
  onPick: (rack: RackSummary) => void;
}) {
  if (loading) return <Quiet>Loading racks…</Quiet>;
  if (error) return <Quiet alert>{error}</Quiet>;
  if (racks.length === 0) return <Quiet>No racks yet. Start one from Racks › New rack.</Quiet>;
  return (
    <MobileRecordCardList label="Choose a rack">
      {racks.map((rack) => {
        const tier = rackTierStatus(rack);
        return (
          <MobileRecordCard
            key={rack.id}
            identity={rack.name}
            title={rackPlacementText(rack)}
            detail={rackShelvesLine(rack)}
            status={tier.status}
            tone={tier.tone}
            onOpen={() => onPick(rack)}
            testId="m-labels-rack"
          />
        );
      })}
    </MobileRecordCardList>
  );
}

export function LabelShelvesStep({
  rack,
  selected,
  arrivalOnly,
  onArrivalOnly,
  onToggle,
}: {
  rack: RackDetail;
  selected: ReadonlySet<string>;
  arrivalOnly: boolean;
  onArrivalOnly: (on: boolean) => void;
  /** Select (`on`) or clear the given label keys (`placard` or a shelf code). */
  onToggle: (keys: readonly string[], on: boolean) => void;
}) {
  const choices = labelChoices(rack, arrivalOnly);
  const shown = shownLabelKeys(choices);
  const chosen = shown.filter((key) => selected.has(key)).length;
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-mode-rule px-mode-page py-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-mode-body text-mode-ink">
          <span className="break-words">
            Arrival shelves only
            <span className="text-text-muted"> · {rack.tieredShelfCount}</span>
          </span>
          <Switch
            checked={arrivalOnly}
            onCheckedChange={onArrivalOnly}
            disabled={rack.tieredShelfCount === 0}
            data-testid="m-labels-arrival-only"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="break-words text-role-caption text-text-muted" data-testid="m-labels-selected-count">
            {chosen} of {plural(shown.length, 'label')} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            radius="pill"
            onClick={() => onToggle(shown, chosen < shown.length)}
            disabled={shown.length === 0}
            data-testid="m-labels-toggle-all"
          >
            {chosen < shown.length ? 'Select all' : 'Clear all'}
          </Button>
        </div>
      </div>
      {shown.length === 0 ? <Quiet>{`No arrival shelves on ${rack.name}.`}</Quiet> : (
        <MobileRecordCardList label={rack.name}>
          {choices.placard ? (
            <MobileRecordCard
              identity="Rack placard"
              title={rack.code}
              detail="The big label on the rack frame"
              selected={selected.has(PLACARD_KEY)}
              onOpen={() => onToggle([PLACARD_KEY], !selected.has(PLACARD_KEY))}
              testId="m-labels-placard"
            />
          ) : null}
          {choices.shelves.map((shelf) => {
            const face = shelfTierStatus(shelf.tier);
            return (
              <MobileRecordCard
                key={shelf.id}
                identity={`Shelf ${shelf.shelf}`}
                title={shelf.code}
                status={face.status}
                tone={face.tone}
                selected={selected.has(shelf.code)}
                onOpen={() => onToggle([shelf.code], !selected.has(shelf.code))}
                testId="m-labels-shelf"
              />
            );
          })}
        </MobileRecordCardList>
      )}
    </>
  );
}

export type LabelPrintRun =
  | { kind: 'idle' }
  | { kind: 'printing'; done: number; total: number }
  | { kind: 'done'; result: PrintLocationRowsResult }
  | { kind: 'failed'; message: string };

export function LabelPrintStep({
  rack,
  count,
  tiered,
  run,
}: {
  rack: RackDetail;
  count: number;
  tiered: number;
  run: LabelPrintRun;
}) {
  return (
    <div className="flex flex-col gap-3 px-mode-page py-4" data-testid="m-labels-print-body">
      <p className="break-words text-mode-body text-mode-ink">
        {plural(count, 'label')} for {rack.name}
        {tiered > 0 ? ` · ${tiered} with an arrival urgency caption` : ''}
      </p>
      {run.kind === 'printing' ? (
        <ProgressBar
          current={run.done}
          goal={Math.max(run.total, 1)}
          label={run.done > 0 ? `Printed ${run.done} of ${run.total}` : `Sending ${plural(run.total, 'label')}…`}
          ariaLabel="Label print progress"
        />
      ) : null}
      {run.kind === 'done' ? (
        <p role="status" className="break-words text-mode-body font-semibold text-mode-ink" data-testid="m-labels-result">
          {locationLabelPrintSummary(run.result)}
        </p>
      ) : null}
      {run.kind === 'failed' ? (
        <p role="alert" className="break-words text-mode-body font-semibold text-text-danger" data-testid="m-labels-error">
          {run.message}
        </p>
      ) : null}
      {run.kind === 'idle' ? (
        <p className="break-words text-role-caption text-text-muted">
          Labels print on this device&apos;s label printer, or open the print dialog when none is connected.
        </p>
      ) : null}
    </div>
  );
}
